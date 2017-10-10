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