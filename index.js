#!/usr/bin/env node

/**
 * Title	文件夹同步
 * Author	LostAbaddon
 * Desc		在多个文件及里同步文件
 * 			判断修改时间
 * 			判断文件内容
 * Next		查看根目录是否存在
 * 			记录文件元信息用来判断是否删除
 * 			可动态识别监视目录是否加载/卸载
 * 			多层目录组监控
 */

const fs = require('fs');
const Path = require('path');
const exec = require('child_process').exec;
require('./core/extend');
require('./core/datetime');
require('./core/logger');
require('./core/fsutils');

const setStyle = require('./core/setConsoleStyle');
const loglev = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod') ? 3 : 1;
const logger = global.logger(loglev);
const configPath = process.cwd() + '/config.json';

class Victim {
	constructor (path, file, node) {
		this.filepath = path;
		this.relativepath = path.replace(node, '');
		this.filename = file;
		this.nodename = node;
		this.isFile = true;
		this.date = null;
	}
}

var targetPaths = [], ignoreRuls = [];
var ignoreMissing = false;
var watchers = [];
var deamonMode = false;
var syncerTimer;
var launchConfig = {
	file: configPath,
	ignore: false,
	deamon: false,
	duration: 1,
	web: false
};

var readConfig = () => {
	fs.readFile(configPath, (err, data) => {
		if (!!err) {
			logger.error(err);
			return;
		}
		var content = data.toString();
		var config = JSON.parse(content);
		updateConfig(config);
	})
};
var updateConfig = config => {
	var paths = config.path;
	var ignores = [];
	// 将忽视规则正则化
	config.ignore.map(ignore => {
		ignores.push(ignore);
		var reg = '^' + ignore
			.replace(/\./g, '\\.')
			.replace(/\*/g, '.*')
			.replace(/\r/g, '\\r')
			.replace(/\?/g, '.?')
			.replace(/\\/g, '\\');
		reg = new RegExp(reg, "i");
		ignores.push(reg);
	});
	if (deamonMode) {
		let timer;
		let syncerTask = () => {
			logger.log('Timely Sync Files.');
			compareFiles();
			if (!!syncerTimer) clearTimeout(syncerTimer);
			syncerTimer = setTimeout(syncerTask, config.monitor * 1000);
		};
		syncerTimer = setTimeout(syncerTask, config.monitor * 1000);
		targetPaths = paths.map(path => {
			path = path.replace(/^~/, process.env.HOME);
			let w;
			try {
				w = fs.watch(path, (...args) => {
					logger.log('File Change: ' + args[1] + ' in ' + path);
					if (!!timer) clearTimeout(timer);
					timer = setTimeout(compareFiles, 1000);
					if (!!syncerTimer) clearTimeout(syncerTimer);
					syncerTimer = setTimeout(syncerTask, config.monitor * 1000 + 1000);
				});
			}
			catch (err) {
				w = null;
				logger.error(err.message);
			}
			if (!!w) watchers.push(w);
			return path;
		});
	}
	ignoreRuls = ignores;

	compareFiles();
};
var compareFiles = () => {
	var filegroup = [];
	var taskcount = targetPaths.length;
	var afterPickFile = async () => {
		var grouplist = filegroup.map(fg => fg.path);
		var groupcount = filegroup.length;
		var filelist = {};
		// 列出所有文件
		filegroup.map(g => {
			g.list.map(f => {
				var v = filelist[f.relativepath] || [];
				v.push({
					group: g.path,
					date: f.date,
					victim: f
				});
				filelist[f.relativepath] = v;
			});
		});
		// 找出发生改变的文件
		var range = [], targetFolders = [];
		Object.keys(filelist).filter(path => {
			var saves = filelist[path];
			var isDeleted = false;
			// 如果使用了--ignore参数，则不比对是否有删除
			if (!ignoreMissing && saves.length !== groupcount) {
				saves.isDeleted = true;
				isDeleted = true;
			}
			var latest = saves[0];
			var date = latest.date;
			latest = latest.victim.filepath;
			var hasChange = false;
			saves.map(s => {
				if (s.date !== date) {
					hasChange = true;
					if (s.date > date) {
						date = s.date;
						latest = s.victim.filepath;
					}
				}
			});
			if (!ignoreMissing) {
				if (hasChange || isDeleted) {
					saves.latest = latest;
					saves.date = date;
				}
			}
			else if (hasChange) {
				saves.latest = latest;
				saves.date = date;
			}
			if (hasChange) {
				saves.isChanged = true;
				return true;
			}
			else {
				return isDeleted;
			}
		}).map(path => {
			var folders = [];
			var saves = filelist[path];
			if (ignoreMissing) {
				saves.map(s => {
					if (!s.victim.isFile) return;
					if (s.victim.filepath !== saves.latest && s.victim.date < saves.date) {
						range.push([saves.latest, s.victim.filepath, s.victim.isFile]);
						folders.push(s.victim.filepath);
					}
				});
			}
			else {
				let all = [];
				saves.map(s => {
					if (!s.victim.isFile) {
						all.push(s.victim.nodename);
						return;
					}
					if (s.victim.filepath === saves.latest || s.victim.date >= saves.date) {
						all.push(s.victim.nodename);
					}
				});
				grouplist.map(p => {
					if (all.indexOf(p) < 0) {
						p = p + path;
						range.push([saves.latest, p, saves[0].victim.isFile]);
						folders.push(p);
					}
				});
			}
			if (folders.length === 0) return;
			folders.map(path => {
				if (saves[0].victim.isFile) {
					path = Path.dirname(path);
				}
				if (targetFolders.indexOf(path) < 0) targetFolders.push(path);
			});
		});
		var err = await checkFolder(targetFolders);
		if (!err) {
			let taskcount = range.length;
			let error = null;
			range.map(async r => {
				if (!r[2]) return; // 只复制文件
				var err = await copyFile(r[0], r[1]);
				if (!!err) error = err;
				taskcount --;
				if (taskcount === 0) {
					if (!error) {
						logger.log('Sync File Done...');
					}
					else {
						logger.error(error);
					}
				}
			});
		}
		else {
			logger.error(err);
		}
	};
	targetPaths.map(async path => {
		var filelist = [];
		await pickFiles(path, ignoreRuls, filelist, path);
		if (filelist.length > 0) {
			filegroup.push({
				path,
				list: filelist
			});
		}
		taskcount --;
		if (taskcount === 0) {
			afterPickFile();
		}
	});
};
var checkFolder = paths => new Promise((resolve, reject) => {
	paths.sort((fa, fb) => fa > fb ? 1 : -1);
	var taskcount = paths.length;
	var err = null;
	paths.map(async p => {
		var e = await fs.mkfolder(p);
		if (!!e) err = e;
		taskcount --;
		if (taskcount === 0) {
			if (!err) resolve();
			else resolve(err);
		}
	});
});
var getFileNameInShell = filename => filename
	.replace(/ /g, '\\ ')
	.replace(/'/g, "\\'")
	.replace(/\(/g, "\\(")
	.replace(/\)/g, "\\)")
	.replace(/\&/g, "\\&");
var copyFile = (origin, target) => new Promise((resolve, reject) => {
	origin = getFileNameInShell(origin);
	target = getFileNameInShell(target);
	var cmd = 'cp -a ' + origin + ' ' + target;
	exec(cmd, (err, stdout, stderr) => {
		if (!!err) {
			logger.error('Sync File Faile: ' + origin);
			resolve(err);
		}
		else {
			logger.info('Sync File Done: ' + origin);
			resolve();
		}
	});
});
// 得到每个目录下文件的更新情况
var pickFiles = (path, ignores, filelist, node) => new Promise((resolve, reject) => {
	fs.readdir(path, (err, files) => {
		if (!!err) {
			resolve();
			return;
		}
		files = checkPath(files, ignores, path, node); // 过滤
		var taskcount = files.length;
		if (taskcount === 0) {
			resolve();
			return;
		}
		files.map(async f => {
			fs.stat(f.filepath, async (err, stat) => {
				if (stat.isFile()) {
					f.date = stat.mtimeMs;
					filelist.push(f);
					taskcount --;
				}
				else if (stat.isDirectory()) {
					f.isFile = false;
					f.date = stat.mtimeMs;
					filelist.push(f);
					await pickFiles(f.filepath, ignores, filelist, node);
					taskcount --;
				}
				else {
					taskcount --;
				}
				if (taskcount === 0) {
					resolve();
				}
			});
		});
	})
});
// 筛选出需要监控的文件
var checkPath = (paths, ignores, folder, node) => {
	var result = [];
	paths.map(path => {
		var available = false;
		ignores.some(reg => {
			available = false;
			if (typeof reg === 'string') {
				if (path === reg) return true;
			}
			else {
				if (reg.test(path)) return true;
			}
			available = true;
		});
		if (available) {
			result.push(new Victim(folder + '/' + path, path, node));
		}
	});
	return result;
};

process.on('unhandledRejection', (reason, p) => {
	logger.error('Unhandled Rejection:', reason);
	// logger.error(p);
});
process.on('rejectionhandled', p => {
	logger.log('Rejection Handled:');
	logger.info(p);
});
process.on('uncaughtException', err => {
	logger.error('Uncaught Exception:');
	logger.error(err);
});

// 命令行控制
const config = { showHidden: false, depth: 5, colors: true };
const clp = require('./core/commander');

// 初始化命令行解析
var cmdLauncher = clp({
	title: '同步者 v0.1.0',
	mode: 'process'
})
.describe('多文件夹自动同步者。\n' + setStyle('当前版本：', 'bold') + 'v0.1.0')
.addOption('--config -c <config> >> 配置文档地址')
.addOption('--ignore -i >> 是否忽略删除')
.addOption('--deamon -d [duration=1] >> 是否启用监控模式，可配置自动监控时间间隔，默认时间为一分钟')
.addOption('--silence -s >> 不启用命令行控制面板')
.addOption('--web -w >> 启用Web后台模式【待开发】')
.on('global', params => {
	params.local.map(opt => {
		if (opt.name === 'config') {
			launchConfig.file = opt.value.config;
		}
		else if (opt.name === 'ignore') {
			launchConfig.ignore = true;
		}
		else if (opt.name === 'deamon') {
			launchConfig.deamon = true;
			launchConfig.duration = opt.value.duration
		}
		else if (opt.name === 'silence') {
			launchConfig.deamon = false;
		}
		else if (opt.name === 'web') {
			launchConfig.web = true;
			rtmLauncher.showError('Web服务模式暂未开启，敬请期待~~');
		}
	});
	console.dir(launchConfig, config);
})
.on('finish', params => {
	if (launchConfig.deamon && !params.local.some(cmd => cmd.name === 'help')) {
		rtmLauncher.launch();
	}
});

// 运行时命令行解析
var rtmLauncher = clp({
	title: '同步者 v0.1.0',
	mode: 'cli',
	hint: {
		welcome: '欢迎来到同步空间~',
		byebye: '世界，终结了。。。'
	}
})
.describe('多文件夹自动同步者。\n' + setStyle('当前版本：', 'bold') + 'v0.1.0')
.add('list >> 显示当前分组同步信息')
.addOption('--group -g <group> >> 指定group标签后可查看指定分组下的源情况')
.add('delete [...files] >> 删除文件列表')
.add('create [...files] >> 创建文件列表')
.add('make [...folders] >> 创建文件夹列表')
.add('copy <source> <target> >> 从外源复制文件进来')
.on('list', params => {
	var group = null;
	params.local.some(opt => {
		if (opt.name === 'group') {
			group = opt.value.group;
			return true;
		}
	});
	if (!group) {
		params.command.showHint('显示所有分组')
	}
	else {
		params.command.showHint('显示分组 ' + group + ' 下的源情况')
	}
})
.on('delete', params => {
	var files = null;
	params.local.some(opt => {
		if (opt.name === 'files') {
			files = opt.value;
			return true;
		}
	});
	if (!files || files.length === 0) {
		params.command.showError('缺少文件参数！');
	}
	else {
		files.map(f => params.command.showHint('文件 ' + f + ' 删除ing...'));
	}
})
.on('create', params => {
	var files = null;
	params.local.some(opt => {
		if (opt.name === 'files') {
			files = opt.value;
			return true;
		}
	});
	if (!files || files.length === 0) {
		params.command.showError('缺少文件参数！');
	}
	else {
		files.map(f => params.command.showHint('文件 ' + f + ' 创建ing...'));
	}
})
.on('make', params => {
	var files = null;
	params.local.some(opt => {
		if (opt.name === 'folders') {
			files = opt.value;
			return true;
		}
	});
	if (!files || files.length === 0) {
		params.command.showError('缺少文件夹参数！');
	}
	else {
		files.map(f => params.command.showHint('文件夹 ' + f + ' 创建ing...'));
	}
})
.on('copy', params => {
	var source = null, target = null;
	params.local.some(opt => {
		if (opt.name === 'source') {
			source = opt.value;
			return !!target;
		}
		else if (opt.name === 'target') {
			target = opt.value;
			return !!source;
		}
	});
	params.command.showHint('复制文件 ' + source + ' 到 ' + target + ' 中...');
});

cmdLauncher.launch();

return;

var command = clp({ title: 'Fuck Slow The Bitch!!!', mode: 'cli' })
	.setParam('[...args=[what;nani]]')
	.addOption('--nani [...files=[x;2;2017-10-13]] >> fuck files!')
	.add('swordart|sao|swd')
	.add('world')
	.command('swordart')
	.setParam('<power> [magic(3|4|5)=3] [portion(1|2|3)=2]')
	.addOption('--soul -s <attack> >> attack enemy')
	.addOption('--ghost -g <defence> >> defence from enemy')
	.describeQuest('What The Fuck!!!')
	.command('world')
	.addOption('--other -o <nani> [what=2017-09-12] [nima=[1;x;true]] [shit={a:a;b:false;c:1}] [...fuck] >> fuck slow the bitch')
	.addOption('--bitch >> who\'s bitch? slow is!')
	.describeQuest('Slow The Bitch!!!')
	.describe('Hello World!!!');
command.on('global', params => {
	params.global.message = 'Fuck Slow The Bitch!!!';
	// console.log('Global Action');
	// console.dir(params, config);
});
command.on('swordart', params => {
	console.log('SwordArt Action');
	console.dir(params, config);
});
command.on('world', params => {
	console.log('World Action');
	console.dir(params, config);
});
command.launch();

return;

// 监视配置文件变更
readConfig();
if (process.argv.indexOf('--deamon') >= 0) {
	deamonMode = true;
	fs.watch(configPath, (...args) => {
		watchers.map(w => w.close());
		if (!!syncerTimer) clearTimeout(syncerTimer);
		readConfig();
	});
}
if (process.argv.indexOf('--ignore') >= 0) {
	ignoreMissing = true;
}
