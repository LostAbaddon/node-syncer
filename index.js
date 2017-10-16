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

const getHealth = require('./core/health');
const setStyle = require('./core/setConsoleStyle');
const loglev = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod') ? 3 : 1;
const logger = global.logger(loglev);
const configPath = process.cwd() + '/config.json';
const deamonDuration = 60;

// 符号相关
var setSymbols = (host, symbols) => {
	symbols.map(symbol => {
		symbol = symbol.toUpperCase();
		Object.defineProperty(host, symbol, {
			value: Symbol(symbol),
			configurable: false,
			enumerable: true
		});
	});
};
WatchMode = {};
setSymbols(WatchMode, ['NOTREADY', 'FOLDER', 'FILE', 'WRONG']);
FolderState = {};
setSymbols(FolderState, ['NOTREADY', 'NOTEXIST', 'EXIST']);
SyncState = {};
setSymbols(SyncState, ['SYNCED', 'LACK', 'UNSYNCED', 'LACKANDUNSYNCED']);
SyncState.Styles = {
	SYNCED: 'green bold',
	UNSYNCED: 'red bold',
	LACK: 'yellow bold',
	LACKANDUNSYNCED: 'magenta bold'
};
SyncState.toString = (state, richtext) => {
	var text = '';
	switch (state) {
		case SyncState.SYNCED:
			text = '已同步';
			if (richtext === true) text = setStyle(text, SyncState.Styles.SYNCED);
			else if (String.is(richtext)) text = setStyle(text, richtext);
			break;
		case SyncState.LACK:
			text = '缺文件';
			if (richtext === true) text = setStyle(text, SyncState.Styles.LACK);
			else if (String.is(richtext)) text = setStyle(text, richtext);
			break;
		case SyncState.LACKANDUNSYNCED:
			text = '缺文件且未同步';
			if (richtext === true) text = setStyle(text, SyncState.Styles.LACKANDUNSYNCED);
			else if (String.is(richtext)) text = setStyle(text, richtext);
			break;
		default:
			text = '未同步';
			if (richtext === true) text = setStyle(text, SyncState.Styles.UNSYNCED);
			else if (String.is(richtext)) text = setStyle(text, richtext);
	}
	return text;
};

// 辅助类
class Source {
	constructor (node, path, name, date) {
		this.nodeName = node;
		this.fullPath = path;
		this.filename = name;
		this.date = date;
	}
}
class File {
	constructor (name, folder) {
		this.name = name;
		this.source = {};
		this.eigen = null;
		if (folder instanceof Folder) this.parentFolder = folder;
		else this.parentFolder = null;
	}
	addSource (source) {
		if (source instanceof Source) {
			this.source[source.nodeName] = source;
			if (!this.eigen) this.eigen = source;
			else if (source.date > this.eigen.date) this.eigen = source;
		}
		else if (source instanceof File) {
			for (let nodeName in source.source) {
				let s = source.source[nodeName];
				this.source[nodeName] = s;
				if (!this.eigen) this.eigen = s;
				else if (s.date > this.eigen.date) this.eigen = s;
			}
		}
		return this;
	}
	get path () {
		if (!this.parentFolder) return '/' + this.name;
		return this.parentFolder.path + this.name;
	}
	state (range) {
		var total = 0, date = null, changed = false;
		for (let s in this.source) {
			total ++;
			s = this.source[s];
			if (!date) {
				date = s.date;
			}
			else if (date !== s.date) {
				changed = true;
			}
		}
		if (total < range.length) {
			return changed ? SyncState.LACKANDUNSYNCED : SyncState.LACK;
		}
		else {
			return changed ? SyncState.UNSYNCED : SyncState.SYNCED;
		}
	}
	sync (range, cb) {
		return new Promise(async (res, rej) => {
			var used = [], targets = [], changed = [], failed = [];
			var source;
			for (source in this.source) {
				source = this.source[source];
				used.push(source.fullPath);
				if (source.date < this.eigen.date) {
					targets.push(source.fullPath);
				}
			}
			if (!syncConfig.ignore) range.map(p => {
				p = p + this.path;
				if (used.indexOf(p) < 0) targets.push(p);
			});
			var count = targets.length;
			if (count === 0) {
				await waitTick();
				let result = [[], []];
				res(result);
				if (cb) cb(result);
				return;
			}
			source = this.eigen.fullPath;
			targets.map(async path => {
				var err = await duplicateFile(source, path);
				if (!!err) failed.push(path);
				else changed.push(path);
				count --;
				if (count > 0) return;
				var result = [changed, failed];
				res(result);
				if (cb) cb(result);
			});
		});
	}
}
class Folder {
	constructor (name, folder) {
		this.name = name;
		this.folders = {};
		this.files = {};
		this.source = [];
		if (folder instanceof Folder) this.parentFolder = folder;
		else this.parentFolder = null;
	}
	addFile (file) {
		if (!(file instanceof File)) return this;
		file.parentFolder = this;
		var files = this.files[file.name];
		if (!files) {
			this.files[file.name] = file;
		}
		else {
			this.files[file.name].addSource(file);
		}
		return this;
	}
	addFolder (folder) {
		if (!(folder instanceof Folder)) return this;
		folder.parentFolder = this;
		var f = this.folders[folder.name];
		if (!f) {
			this.folders[folder.name] = folder;
		}
		else {
			for (let sub in folder.folders) {
				f.addFolder(sub);
			}
			for (let sub in folder.files) {
				f.addFile(sub);
			}
			for (let source of folder.source) {
				f.addSource(source);
			}
		}
		return this;
	}
	addSource (source) {
		if (this.source.indexOf(source) < 0) this.source.push(source);
		return this;
	}
	state (range) {
		if (this.source.length < range.length) return SyncState.LACK;
		return SyncState.SYNCED;
	}
	get path () {
		if (!this.parentFolder) return '/';
		return this.parentFolder.path + this.name + '/';
	}
	tree (range) {
		var folderList = [], dirList = [], fileList = [];
		for (let f in this.folders) {
			dirList.push(this.folders[f]);
		}
		dirList.sort((fa, fb) => fa.name.toLowerCase() > fb.name.toLowerCase());
		dirList.map(f => {
			var state = f.state(range);
			folderList.push([f.path, state]);
			var list = f.tree(range);
			list.unshift(0);
			list.unshift(folderList.length);
			folderList.splice.apply(folderList, list);
		});

		dirList = [];
		for (let f in this.files) {
			dirList.push(this.files[f]);
		}
		dirList.sort((fa, fb) => fa.name.toLowerCase() > fb.name.toLowerCase());
		dirList.map(f => {
			var state = f.state(range);
			fileList.push([f.path, state]);
		});
		
		fileList.unshift(0);
		fileList.unshift(folderList.length);
		folderList.splice.apply(folderList, fileList);
		return folderList;
	}
	sync (range, cb) {
		return new Promise(async (res, rej) => {
			var changed = [], failed = [], list;

			if (syncConfig.ignore) {
				range = this.source;
			}
			else {
				list = await this.syncSelf(range);
				combileList(list, changed, failed);
			}

			var task = 2;
			this.syncFiles(range, list => {
				combileList(list, changed, failed);
				task --;
				if (task > 0) return;
				var result = [changed, failed];
				res(result);
				if (cb) cb(result);
			});
			this.syncFolders(range, list => {
				combileList(list, changed, failed);
				task --;
				if (task > 0) return;
				var result = [changed, failed];
				res(result);
				if (cb) cb(result);
			});
		});
	}
	syncSelf (range, cb) {
		return new Promise(async (res, rej) => {
			var changed = [], failed = [];
			var list = [];
			range.map(p => {
				if (this.source.indexOf(p) < 0) list.push(p);
			});
			var result = [changed, failed], count = list.length;
			if (count === 0) {
				await waitTick();
				res(result);
				if (cb) cb(result);
				return;
			}
			list.map(async p => {
				p = p + this.path;
				var err = await prepareFolder(p);
				count --;
				if (count > 0) return;
				res(result);
				if (cb) cb(result);
			});
		});
	}
	syncFolders (range, cb) {
		return new Promise(async (res, rej) => {
			var changed = [], failed = [], count = 0;
			Object.keys(this.folders).map(async folder => {
				count ++;
				folder = this.folders[folder];
				var list = await folder.sync(range);
				combileList(list, changed, failed);
				count --;
				if (count > 0) return;
				var result = [changed, failed];
				res(result);
				if (cb) cb(result);
			});
			if (count === 0) {
				await waitTick();
				let result = [changed, failed];
				res(result);
				if (cb) cb(result);
			}
		});
	}
	syncFiles (range, cb) {
		return new Promise(async (res, rej) => {
			var changed = [], failed = [], count = 0;
			Object.keys(this.files).map(async file => {
				count ++;
				file = this.files[file];
				var list = await file.sync(range);
				combileList(list, changed, failed);
				count --;
				if (count > 0) return;
				var result = [changed, failed];
				res(result);
				if (cb) cb(result);
			});
			if (count === 0) {
				await waitTick();
				let result = [changed, failed];
				res(result);
				if (cb) cb(result);
			}
		});
	}
}
class Group {
	constructor (name, folders) {
		this.name = name;
		this.folders = {};
		this.mode = WatchMode.NOTREADY;
		this.map = new Folder('/');

		var cbReady = null;
		this.onReady = cb => {
			if (this.mode !== WatchMode.NOTREADY) {
				setImmediate(() => {
					cb(this.mode);
				});
			}
			else {
				cbReady = cb;
			}
		};

		var folderCount = [folders.length, 0, 0];
		folders.map(path => {
			this.folders[path] = FolderState.NOTREADY;
			fs.stat(path, (err, stat) => {
				if (!!err || !stat) {
					this.folders[path] = FolderState.NOTEXIST;
				}
				else if (stat.isFile()) {
					this.folders[path] = FolderState.EXIST;
					folderCount[1] ++;
				}
				else if (stat.isDirectory()) {
					this.folders[path] = FolderState.EXIST;
					folderCount[2] ++;
				}
				else {
					this.folders[path] = FolderState.NOTEXIST;
				}
				folderCount[0] --;
				if (folderCount[0] === 0) {
					if (folderCount[1] > 0 && folderCount[2] > 0) {
						this.mode = WatchMode.WRONG;
					}
					else if (folderCount[1] === 0 && folderCount[2] === 0) {
						this.mode = WatchMode.WRONG;
					}
					else if (folderCount[1] > 0) {
						this.mode = WatchMode.FILE;
					}
					else {
						this.mode = WatchMode.FOLDER;
					}
					folderCount = null;
					scanGroup(this, () => {
						if (!!cbReady) {
							cbReady(this.mode);
							cbReady = null;
						}
					});
				}
			});
		});
	}
	get range () {
		if (this.mode === WatchMode.NOTREADY) return [];
		if (this.mode === WatchMode.WRONG) return [];
		var range = [];
		for (let r in this.folders) {
			if (this.folders[r] === FolderState.EXIST) range.push(r);
		}
		range.sort((ra, rb) => ra > rb);
		return range;
	}
	get tree () {
		if (this.mode === WatchMode.NOTREADY) return [ '该分组不可用！' ];
		if (this.mode === WatchMode.WRONG) return [ '该分组配置异常！' ];
		var range = this.range;
		if (this.mode === WatchMode.FILE) {
			let state = this.map.files.single_file.state(range);
			return range.map(f => [f, state]);
		}
		return this.map.tree(range);
	}
	sync () {
		return new Promise(async (res, rej) => {
			var range = this.range;
			var changeList;
			if (this.mode === WatchMode.FILE) {
				let fn = this.map.files.single_file.path.length;
				range = range.map(p => p.substring(0, p.length - fn));
				changeList = await this.map.files.single_file.sync(range);
			}
			else if (this.mode === WatchMode.FOLDER) {
				changeList = await this.map.sync(range);
				await waitTick();
			}
			res(changeList);
		});
	}
}

// 扫描相关
var scanFile = (file, node, path, filename, cb) => {
	fs.stat(path, (err, stat) => {
		if (!!err || !stat) {
			cb(false);
			return;
		}
		if (checkIgnoreRule(filename)) {
			cb(false);
			return;
		}
		var source = new Source(node, path, filename, stat.mtimeMs);
		file.addSource(source);
		cb(true);
	});
};
var scanFolder = (folder, node, path, cb) => {
	fs.readdir(path, (err, files) => {
		if (!!err) {
			cb(false);
			return;
		}
		folder.addSource(node);
		var tasks = files.length;
		if (tasks === 0) {
			cb(true);
			return;
		}
		var taskDone = task => {
			tasks --;
			if (tasks > 0) return;
			cb(true);
		};
		files.map(subpath => {
			if (checkIgnoreRule(subpath)) {
				taskDone(fullpath);
				return;
			}
			var fullpath = path + Path.sep + subpath;
			fs.stat(fullpath, (err, stat) => {
				if (!!err || !stat) {
					taskDone(fullpath);
					return;
				}
				if (stat.isFile()) {
					let file = new File(subpath);
					folder.addFile(file);
					file = folder.files[subpath];
					let source = new Source(node, fullpath, file.name, stat.mtimeMs);
					file.addSource(source);
					taskDone(fullpath);
				}
				else if (stat.isDirectory()) {
					let dir = new Folder(subpath);
					folder.addFolder(dir);
					dir = folder.folders[subpath];
					scanFolder(dir, node, fullpath, () => {
						taskDone(fullpath);
					});
				}
				else {
					taskDone(fullpath);
				}
			});
		});
	});
};
var scanGroup = (group, cb) => {
	if (group.mode === WatchMode.NOTREADY || group.mode === WatchMode.WRONG) return;
	if (group.mode === WatchMode.FILE) {
		let file = new File('single_file'), fileCount = 0, fileTask = 0;
		for (let f in group.folders) {
			if (group.folders[f] !== FolderState.EXIST) continue;
			fileCount ++;
			let fn = Path.basename(f);
			scanFile(file, f, f, fn, ok => {
				fileTask ++;
				if (fileTask < fileCount) return;
				if (Object.keys(file.source).length > 0) group.map.addFile(file);
				file.name = file.eigen.filename;
				cb();
			});
		}
		if (fileCount === 0) cb();
	}
	else {
		let folderCount = 0, folderTask = 0;
		for (let f in group.folders) {
			if (group.folders[f] !== FolderState.EXIST) continue;
			folderCount ++;
			scanFolder(group.map, f, f, ok => {
				folderTask ++;
				if (folderTask < folderCount) return;
				cb();
			});
		}
		if (folderCount === 0) cb();
	}
};

// 同步相关
var getFileNameInShell = filename => filename
	.replace(/ /g, '\\ ')
	.replace(/'/g, "\\'")
	.replace(/\(/g, "\\(")
	.replace(/\)/g, "\\)")
	.replace(/\&/g, "\\&");
var prepareFolder = (target, cb) => new Promise(async (res, rej) => {
	var err = await fs.mkfolder(target);
	changePrompt(syncConfig.syncPrompt);
	if (!!err) logger.log(setStyle(setStyle('新建目录失败：', 'bold') + target, 'red'));
	else logger.log(setStyle('新建目录：', 'yellow bold') + target);
	changePrompt();
	res(err);
	if (cb) cb(err);
});
var duplicateFile = (source, target, cb) => new Promise(async (res, rej) => {
	source = getFileNameInShell(source);
	target = getFileNameInShell(target);
	var cmd = 'cp -a ' + source + ' ' + target;
	exec(cmd, (err, stdout, stderr) => {
		changePrompt(syncConfig.syncPrompt);
		if (!!err) logger.log(setStyle(setStyle('同步文件失败：', 'bold') + target, 'red'));
		else logger.log(setStyle('同步文件：', 'bold') + target);
		changePrompt();
		res(err);
		if (cb) cb(err);
	});
});
var combileList = (list, changed, failed) => {
	list[0].map(p => {
		if (changed.indexOf(p) < 0) changed.push(p);
	});
	list[1].map(p => {
		if (failed.indexOf(p) < 0) failed.push(p);
	});
};

// 配置
var syncConfig = {
	file: configPath,
	ignore: false,
	deamon: false,
	silence: false,
	duration: null,
	web: false,
	ignores: [],
	group: {},
	syncPrompt: setStyle('同步者：', 'green bold'),
	mapPaddingLeft: 80,
	mapPaddingLevel: 20
};
var syncGroups = {};

// 其它辅助
var readJSON = file => new Promise((res, rej) => {
	fs.readFile(file, (err, data) => {
		if (!!err) {
			rej(err);
			return;
		}
		var content = data.toString();
		try {
			content = JSON.parse(content);
		}
		catch (e) {
			rej(e);
			return;
		}
		res(content);
	});
});
const RegMonoWidthChars = /[\x00-\xff–]+/g;
var getCLLength = text => {
	var len = text.length;
	var ascii = text.match(RegMonoWidthChars);
	if (!ascii) ascii = '';
	return len * 2 - ascii.join('').length;
};
var waitTick = async () => new Promise((res, rej) => setImmediate(res));

// CLI相关
var originHints = null;
var changePrompt = prompt => {
	if (!syncConfig.deamon || syncConfig.silence) return;
	if (!originHints) originHints = rtmLauncher.cli.hints.copy();
	if (!!prompt) {
		rtmLauncher.cli.hints.hint = prompt;
		rtmLauncher.cli.hints.answer = prompt;
		rtmLauncher.cli.hints.error = prompt;
	}
	else {
		rtmLauncher.cli.hints.hint = originHints.hint;
		rtmLauncher.cli.hints.answer = originHints.answer;
		rtmLauncher.cli.hints.error = originHints.error;
	}
	rtmLauncher.cli.hint();
};

// Ignore规则相关
var getIgnoreRules = ignorelist => {
	var ignores = [];
	// 将忽视规则正则化
	ignorelist.map(ignore => {
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
	return ignores;
};
var checkIgnoreRule = fileName => {
	return syncConfig.ignores.some(rule => {
		if (String.is(rule)) {
			if (fileName === rule) return true;
		}
		else {
			if (rule.test(fileName)) return true;
		}
	});
};

var initialGroups = list => new Promise((resolve, reject) => {
	var groups = {};
	var groupCount = Object.keys(list).length;
	for (let group in list) {
		let g = new Group(group, list[group]);
		g.onReady(mode => {
			groupCount --;
			if (groupCount === 0) {
				resolve(groups);
			}
		});
		groups[group] = g;
	}
});
var launchSync = groups => new Promise((res, rej) => {
	var changeGroup = {}, failGroup = {}, changeList = [], failList = [], changeCount = 0;
	Object.keys(groups).map(async group => {
		changeCount ++;
		group = groups[group];
		var list = await group.sync();
		changeGroup[group.name] = list[0];
		failGroup[group.name] = list[1];
		combileList(list, changeList, failList);
		changeCount --;
		if (changeCount > 0) return;
		res([changeGroup, failGroup, changeList, failList]);
	});
});
var launchMission = async () => {
	changePrompt(syncConfig.syncPrompt);
	logger.log('开始分析目录组......');
	changePrompt();
	syncGroups = await initialGroups(syncConfig.group);

	changePrompt(syncConfig.syncPrompt);
	logger.log('目录分析完成，开始同步......');
	changePrompt();
	var changeList = [{}, {}, [], []], list = [0, 0, [0], [0]];
	for (let group in syncGroups) {
		changeList[0][group] = [];
		changeList[1][group] = [];
	}
	while (list[2].length + list[3].length > 0) {
		list = await launchSync(syncGroups);
		if (list[2].length + list[3].length === 0) {
			break;
		}

		for (let group in syncGroups) {
			list[0][group].map(p => {
				if (changeList[0][group].indexOf(p) < 0) changeList[0][group].push(p);
			});
			list[1][group].map(p => {
				if (changeList[1][group].indexOf(p) < 0) changeList[1][group].push(p);
			});
		}
		list[2].map(p => {
			if (changeList[2].indexOf(p) < 0) changeList[2].push(p);
		});
		list[3].map(p => {
			if (changeList[3].indexOf(p) < 0) changeList[3].push(p);
		});

		changePrompt(syncConfig.syncPrompt);
		logger.log('有变更，重新分析分组......');
		changePrompt();
		syncGroups = await initialGroups(syncConfig.group);
	}

	changePrompt(syncConfig.syncPrompt);
	logger.log('同步完成......');
	logger.log(setStyle(setStyle('同步成功 ', 'bold') + changeList[2].length + ' 个文件', 'green'));
	logger.log(setStyle(setStyle('同步失败 ', 'bold') + changeList[3].length + ' 个文件', 'magenta'));
	for (let group in syncGroups) {
		let changed = changeList[0][group].length;
		let failed = changeList[1][group].length;
		if (changed + failed === 0) continue;
		let message = setStyle(setStyle('同步 ' + group + '： ', 'bold') + (changed + failed) + ' 个文件/目录', 'underline')
		if (changed > 0) message += '\n        ' + setStyle(setStyle('同步成功： ', 'bold') + changed + ' 个文件/目录', 'green');
		if (failed > 0) message += '\n        ' + setStyle(setStyle('同步失败： ', 'bold') + failed + ' 个文件/目录', 'magenta');
		logger.log(message);
	}
	changePrompt();
};












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
var deamonMode = false;
var watchers = [];
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
.addOption('--deamon -d [duration(^\\d+$|^\\d+\\.\\d*$)=1] >> 是否启用监控模式，可配置自动监控时间间隔，默认时间为一分钟')
.addOption('--silence -s >> 不启用命令行控制面板')
.addOption('--web -w >> 启用Web后台模式' + setStyle('【待开发】', ['green', 'bold']))
.on('command', params => {
	if (!!params.config) syncConfig.file = params.config;
	if (!!params.ignore) syncConfig.ignore = params.ignore;
	if (!!params.deamon) syncConfig.deamon = params.deamon;
	if (!isNaN(params.duration)) syncConfig.duration = params.duration * 60;
	if (!!params.silence) syncConfig.silence = true;
	if (!!params.web) {
		syncConfig.web = params.web;
		logger.error('Web服务模式暂未开启，敬请期待~~');
	}
})
.on('done', async params => {
	if (params.help) return;
	var config;
	try {
		config = await readJSON(syncConfig.file);
	}
	catch (err) {
		try {
			config = await readJSON(configPath);
		}
		catch (e) {
			config = {};
		}
	}
	syncConfig.deamon = syncConfig.deamon || config.deamonMode || false;
	syncConfig.duration = syncConfig.duration || config.monitor || deamonDuration;
	syncConfig.ignores = config.ignore || [];
	syncConfig.group = config.group || {};

	syncConfig.ignores = getIgnoreRules(syncConfig.ignores);
	for (let group in syncConfig.group) {
		syncConfig.group[group] = syncConfig.group[group].map(path => path.replace(/^~/, process.env.HOME));
	}

	if (syncConfig.deamon && !syncConfig.silence) {
		rtmLauncher.launch();

		logger.info = (...args) => { args.map(arg => rtmLauncher.showHint(arg)) };
		logger.log = (...args) => { args.map(arg => rtmLauncher.showHint(arg)) };
		logger.warn = (...args) => { args.map(arg => rtmLauncher.showError(arg)) };
		logger.error = (...args) => { args.map(arg => rtmLauncher.showError(arg)) };

		// rtmLauncher.parse('--help');
	}

	launchMission();
});

// 监控系统运行状态
var healthWatcher = null;
var getPercent = num => {
	num = (Math.round(num * 10000) / 100) + '';
	num = num.split('.');
	if (num.length < 2) num[1] = '00';
	var len = num[0].length;
	if (len === 0) num[0] = ' 0';
	else if (len === 1) num[0] = ' ' + num[0];
	len = num[1].length;
	if (len === 0) num[1] = '00';
	else if (len === 1) num[1] = num[1] + '0';
	return num[0] + '.' + num[1] + '%';
};
var showHealth = (health, command) => {
	var cpu = getPercent(health.cpu), mem = getPercent(health.mem);
	logger.log('CPU: ' + cpu + '      MEM: ' + mem);
};

// 运行时命令行解析
var rtmLauncher = clp({
	title: '同步者 v0.1.0',
	mode: 'cli',
	hint: {
		welcome: setStyle('欢迎来到同步空间~', 'yellow underline bold'),
		byebye: setStyle('世界，终结了。。。', 'magenta bold')
	}
})
.describe('多文件夹自动同步者。\n' + setStyle('当前版本：', 'bold') + 'v0.1.0')
.add('refresh >> 强制同步更新')
.add('list >> 显示当前分组同步信息')
.addOption('--group -g <group> >> 指定group标签后可查看指定分组下的源情况')
.addOption('--files -f <path> >> 查看指定路径下的文件列表')
.addOption('--all -a >> 显示所有文件与文件夹，不打开则只显示有变化的文件与文件夹')
.add('delete [...files] >> 删除文件列表')
.add('create [...files] >> 创建文件列表')
.addOption('--folder -f >> 指定创建的是文件夹')
.add('copy <source> <target> >> 从外源复制文件进来')
.add('health|hth [duration(^\\d+$|^\\d+\\.\\d*$)=1] >> 查看当前 CPU 与 MEM 使用状态，统计时长单位为秒')
.addOption('--interval -i [interval(^\\d+$|^\\d+\\.\\d*$)=1] >> 定式更新，更新间隔单位为秒')
.addOption('--stop -s >> 定制定式更新')
.on('command', (params, command) => {
	if (Object.keys(params).length > 1) return;
	if (params.mission.length > 0) return;
	logger.error('不存在该指令哦！输入 help 查看命令~');
})
.on('refresh', (params, all, command) => {
	launchMission();
})
.on('list', (params, all, command) => {
	var groupList = Object.keys(syncGroups);
	var groupCount = [groupList.length, 0, 0, groupList.length];
	groupList = { folder: [], file: [], wrong: [] };
	for (let g in syncGroups) {
		g = syncGroups[g];
		if (g.mode !== WatchMode.NOTREADY) {
			groupCount[3] --;
			if (g.mode === WatchMode.FILE) {
				groupCount[1] ++;
				groupList.file.push(g);
			}
			else if (g.mode === WatchMode.FOLDER) {
				groupCount[2] ++;
				groupList.folder.push(g);
			}
			else {
				groupList.wrong.push(g);
			}
		}
	}
	if (groupCount[3] > 0) {
		logger.error('设置读取暂未完成，请稍等。。。');
		return;
	}

	var group = params.group;
	var path = params.path;
	var showAll = !!params.all;
	if (!group) {
		let wrongCount = groupCount[0] - groupCount[1] - groupCount[2];
		let message = [ '' ];
		message.push(setStyle(`共有 ${groupCount[0]} 个分组，其中 ${groupCount[2]} 个目录分组、 ${groupCount[1]} 个文件分组和 ${wrongCount} 个错误分组。`, 'bold'));
		if (groupCount[2] > 0) {
			message.push(setStyle(`目录分组（${groupCount[2]} 个）：`, 'green bold'));
			groupList.folder.map(g => {
				message.push('    ' + setStyle('分组：' + g.name, 'bold'));
				for (let folder in g.folders) {
					let state = g.folders[folder];
					if (g.folders[folder] === FolderState.NOTEXIST) {
						message.push('        - ' + setStyle('路径：' + folder + '（不存在）', 'red bold'));
					}
					else {
						message.push('        - ' + setStyle('路径：', 'bold') + folder);
					}
				}
			});
		}
		if (groupCount[1] > 0) {
			message.push(setStyle(`文件分组（${groupCount[1]} 个）：`, 'yellow bold'));
			groupList.file.map(g => {
				message.push('    ' + setStyle('分组：' + g.name, 'bold'));
				for (let folder in g.folders) {
					let state = g.folders[folder];
					if (g.folders[folder] === FolderState.NOTEXIST) {
						message.push('        - ' + setStyle('路径：' + folder + '（不存在）', 'red bold'));
					}
					else {
						message.push('        - ' + setStyle('路径：', 'bold') + folder);
					}
				}
			});
		}
		if (wrongCount > 0) {
			message.push(setStyle(`错误分组（${wrongCount} 个）：`, 'red bold'));
			groupList.wrong.map(g => {
				message.push('    ' + setStyle('分组：' + g.name, 'bold'));
				for (let folder in g.folders) {
					let state = g.folders[folder];
					if (g.folders[folder] === FolderState.NOTEXIST) {
						message.push('        - ' + setStyle('路径：' + folder + '（不存在）', 'red bold'));
					}
					else {
						message.push('        - ' + setStyle('路径：', 'bold') + folder);
					}
				}
			});
		}
		logger.log(message.join('\n'));
	}
	else {
		let g = syncGroups[group];
		if (!g) {
			logger.error('指定分组 ' + group + ' 不存在！');
			return;
		}
		let state = '';
		let message = [ '' ];
		if (g.mode === WatchMode.FILE) state = '监控文件';
		else if (g.mode === WatchMode.FOLDER) state = '监控目录';
		else state = '异常';
		message.push(setStyle('分组：', 'bold') + group);
		message.push(setStyle('状态：', 'bold') + state);
		if (g.mode !== WatchMode.WRONG) {
			let folders = g.folders;
			let counts = [0, 0, [], []];
			for (let g in folders) {
				if (folders[g] === FolderState.EXIST) {
					counts[0] ++;
					counts[2].push(g);
				}
				else {
					counts[1] ++;
					counts[3].push(g);
				}
			}
			message.push(setStyle('监控路径数：', 'bold') + (counts[0] + counts[1]));
			if (counts[0] > 0) {
				message.push('    ' + setStyle('可监控路径：', 'bold') + counts[0]);
				counts[2].map(p => message.push('        ' + p));
			}
			if (counts[1] > 0) {
				message.push('    ' + setStyle('异常路径：', 'red bold') + counts[1]);
				counts[3].map(p => message.push('        ' + setStyle(p, 'red')));
			}
		}
		message.push(setStyle('文件同步状态：', 'bold'));
		let grp = syncGroups[group];
		let tree = grp.tree;
		if (!showAll) {
			tree = tree.filter(t => t[1] !== SyncState.SYNCED)
		}
		if (!!path) {
			tree = tree.filter(t => t[0].indexOf(path) >= 0)
		}
		if (tree.length === 0) {
			if (showAll) message.push('    ' + setStyle('无文件', 'blue bold'));
			else message.push('    ' + setStyle('都已同步', 'green bold'));
		}
		tree.map(t => {
			var len = getCLLength(t[0]), vlen = len + 2;
			vlen = Math.ceil(vlen / syncConfig.mapPaddingLevel) * syncConfig.mapPaddingLevel;
			if (vlen < syncConfig.mapPaddingLeft) vlen = syncConfig.mapPaddingLeft;
			message.push('    ' + t[0] + String.blank(vlen - len) + ' | ' + SyncState.toString(t[1], true));
		});
		logger.log(message.join('\n'));
	}
})
.on('delete', (params, all, command) => {
	var files = params.files;
	if (!files || files.length === 0) {
		logger.error('缺少文件参数！');
	}
	else {
		files.map(f => logger.log('文件 ' + f + ' 删除ing...'));
	}
})
.on('create', (params, all, command) => {
	var files = params.files;
	if (!files || files.length === 0) {
		logger.error('缺少文件参数！');
	}
	else {
		files.map(f => logger.log('文件 ' + f + ' 创建ing...'));
	}
})
.on('copy', (params, all, command) => {
	var source = params.source, target = params.target;
	if (!source) logger.error('缺少源文件路径！');
	else if (!target) logger.error('缺少目标文件路径！');
	logger.log('复制文件 ' + source + ' 到 ' + target + ' 中...');
})
.on('health', (param, all, command) => {
	getHealth(param.duration * 1000, result => {
		showHealth(result, command);
	});
	if (!isNaN(param.interval)) {
		if (!!healthWatcher) clearInterval(healthWatcher);
		healthWatcher = setInterval(async () => {
			var result = await getHealth(param.duration * 1000);
			showHealth(result, command);
		}, param.interval * 1000);
	}
	else if (param.stop) {
		if (!!healthWatcher) clearInterval(healthWatcher);
	}
})
.on('exit', (param, command) => {
	if (!!healthWatcher) {
		changePrompt(syncConfig.syncPrompt);
		logger.log('结束健康监控。。。');
		changePrompt();
		clearInterval(healthWatcher);
	}
	param.msg = '同步者已死……';
});

cmdLauncher.launch();

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