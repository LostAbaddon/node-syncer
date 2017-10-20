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

const SyncerTitle = '同步者';
const SyncerVersion = '1.0.3.dev';

const fs = require('fs');
const Path = require('path');
require('./core/extend');
require('./core/datetime');
require('./core/logger');
require('./core/fsutils');
require('./core/events/pipe');

const clp = require('./core/commandline/commander');
const getHealth = require('./core/health');
const setStyle = require('./core/setConsoleStyle');
const timeNormalize = global.Utils.getTimeString;
const loglev = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod') ? 3 : 1;
const logger = global.logger(loglev);
const configPath = process.cwd() + '/config.json';
const deamonDuration = 60;
const deamonDelay = 1;

// 系统级错误处理
process.on('unhandledRejection', (reason, p) => {
	logger.error('Unhandled Rejection:', reason);
	console.error(p);
});
process.on('uncaughtException', err => {
	logger.error('Uncaught Exception:');
	console.error(err);
});

// 配置
var syncConfig = {
	file: configPath,
	showdiff: false,
	ignore: false,
	deaf: false,
	deamon: false,
	delay: 1,
	silence: true,
	duration: null,
	web: false,
	socket: false,
	ignores: [],
	group: {},
	syncPrompt: setStyle(SyncerTitle + '：', 'green bold'),
	mapPaddingLeft: 80,
	mapPaddingLevel: 20
};
var syncGroups = {};
var handcraftCreating = false;
var stopPatrol = false;

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
				if (!!err) {
					logger.error(setStyle('同步文件失败：', 'red bold') + path);
					failed.push(path);
				}
				else {
					logger.log(setStyle('同步文件成功：', 'green bold') + path);
					changed.push(path);
				}
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
			folderList.push([f.path, state, WatchMode.FOLDER]);
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
			fileList.push([f.path, state, WatchMode.FILE]);
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
		this.onReady = async cb => {
			if (this.mode !== WatchMode.NOTREADY) {
				await waitTick();
				cb(this.mode);
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
			return range.map(f => [f, state, WatchMode.FILE]);
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
var prepareFolder = (target, cb) => new Promise(async (res, rej) => {
	var err = await fs.mkfolder(target);
	changePrompt(syncConfig.syncPrompt);
	if (!!err) logger.log(setStyle(setStyle('新建目录失败：', 'bold') + target, 'red'));
	else logger.log(setStyle('新建目录：', 'yellow bold') + target);
	changePrompt();
	res(err);
	if (cb) cb(err);
});
var duplicateFile = (source, target, cb) => new Promise((res, rej) => {
	var task = 2;
	var cbb = () => {
		task --;
		if (task > 0) return;
		fs.copyFile(source, target, err => {
			if (!!err) {
				let result = {};
				result.message = setStyle(setStyle('复制文件错误：', 'bold') + target, 'red');
				result.err = err;
				res(result);
				if (cb) cb(result);
			}
			else {

			}
			res();
			if (cb) cb();
		});
	};
	var silence = {
		log: () => {},
		info: () => {},
		warn: (...args) => logger.warn.call(logger, ...args),
		error: (...args) => logger.error.call(logger, ...args)
	};
	fs.stat(source, (err, stat) => {
		if (!!err || !stat) {
			let result = {};
			result.message = setStyle(setStyle('源文件错误：', 'bold') + source, 'red');
			result.err = err;
			res(result);
			if (cb) cb(result);
		}
		else cbb();
	});
	fs.stat(target, async (err, stat) => {
		if (!!err || !stat) {
			cbb();
			return;
		}
		if (stat.isDirectory()) {
			stat = await fs.deleteFolders([target], true, silence);
		}
		else {
			stat = await fs.deleteFiles([target], silence);
		}
		if (stat.failed.length > 0) {
			let result = {};
			result.message = setStyle(setStyle('无法复制到目标位置：', 'bold') + target, 'red');
			result.err = err;
			res(result);
			if (cb) cb(result);
			return;
		}
		cbb();
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
	if (!ascii) ascii = [''];
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
var generateIgnoreRules = ignorelist => {
	var ignores = [];
	// 将忽视规则正则化
	ignorelist.map(ignore => {
		var reg;
		if (ignore.match(/\/.*\//)) {
			reg = new RegExp(ignore.substring(1, ignore.length - 1), "i");
		}
		else {
			ignores.push(ignore);
			reg = '^' + ignore
				.replace(/\./g, '\\.')
				.replace(/\*/g, '.*')
				.replace(/\r/g, '\\r')
				.replace(/\?/g, '.?')
				.replace(/\\/g, '\\');
			reg = new RegExp(reg, "i");
		}
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

// 监控相关
var deamonWatch = null;
var configWatch = null;
var fileWatchers = {};
var watcherTrigger = null;
var treeWatcher = (path, isFile) => (stat, file) => {
	if (syncConfig.deaf) return;
	if (handcraftCreating) return;
	if (checkIgnoreRule(file)) return;
	if (!!watcherTrigger) clearTimeout(watcherTrigger);
	watcherTrigger = setTimeout(() => {
		changePrompt(syncConfig.syncPrompt);
		logger.log(setStyle('发现文件改动', 'blue bold') + '（' + timeNormalize() + '）：' + path + (!!isFile ? '' : '/' + file));
		changePrompt();
		launchMission(true);
	}, syncConfig.delay * 1000);
};
var razeAllWatchers = () => {
	if (!!watcherTrigger) clearTimeout(watcherTrigger);
	for (let watch in fileWatchers) {
		let w = fileWatchers[watch];
		if (!!w) w.close();
		fileWatchers[watch] = null;
	}
};
var watchTrees = groups => {
	razeAllWatchers();
	if (syncConfig.deaf) return;
	for (let group in groups) {
		group = groups[group];
		if (group.mode === WatchMode.FILE) {
			group.tree.map(path => {
				path = path[0];
				if (!!fileWatchers[path]) return;
				var watch;
				try {
					watch = fs.watch(path, treeWatcher(path, true));
				}
				catch (err) {
					logger.error(err.message);
					console.error(err);
				}
				if (!!watch) fileWatchers[path] = watch;
			});
			continue;
		}
		group.range.forEach(path => {
			if (!!fileWatchers[path]) return;
			var watch;
			try {
				watch = fs.watch(path, { recursive: true }, treeWatcher(path));
			}
			catch (err) {
				logger.error(err.message);
				console.error(err);
			}
			if (!!watch) fileWatchers[path] = watch;
		});
	}
};

// 历史相关
var omniHistory = {
	last: { changed: [], failed: [] },
	total: { changed: [], failed: [] },
	timeline: {}
};
omniHistory.record = (changed, failed) => {
	var time = new Date();
	omniHistory.last.changed = [];
	omniHistory.last.failed = failed;
	changed.forEach(path => {
		omniHistory.timeline[path] = time;
		var index = omniHistory.last.failed.indexOf(path);
		if (index >= 0) omniHistory.last.failed.splice(index, 1);
		index = omniHistory.last.changed.indexOf(path);
		if (index < 0) omniHistory.last.changed.push(path);
		index = omniHistory.total.failed.indexOf(path);
		if (index >= 0) omniHistory.total.failed.splice(index, 1);
		index = omniHistory.total.changed.indexOf(path);
		if (index < 0) omniHistory.total.changed.push(path);
	});
	failed.forEach(path => {
		omniHistory.timeline[path] = time;
		var index = omniHistory.last.changed.indexOf(path);
		if (index >= 0) omniHistory.last.changed.splice(index, 1);
		index = omniHistory.last.failed.indexOf(path);
		if (index < 0) omniHistory.last.failed.push(path);
		index = omniHistory.total.changed.indexOf(path);
		if (index >= 0) omniHistory.total.changed.splice(index, 1);
		index = omniHistory.total.failed.indexOf(path);
		if (index < 0) omniHistory.total.failed.push(path);
	});
};
omniHistory.recall = mode => {
	var changed = [], failed = [];
	var list = !!mode ? omniHistory.total : omniHistory.last;
	list.changed.sort((a, b) => omniHistory.timeline[a] < omniHistory.timeline[b] ? 1 : -1);
	list.failed.sort((a, b) => omniHistory.timeline[a] < omniHistory.timeline[b] ? 1 : -1);
	list.changed.forEach(path => changed.push([path, omniHistory.timeline[path]]));
	list.failed.forEach(path => failed.push([path, omniHistory.timeline[path]]));
	return { changed, failed };
};

// 文件操作
var createFilesAndFolders = (group, paths, isFolder, cb) => new Promise(async (res, rej) => {
	handcraftCreating = true;

	var range = group.range, files = [], folders = [];
	// 获取真实路径
	paths.forEach(f => {
		f = '/' + f.replace(/^\/+/, '').trim();
		range.forEach(p => {
			var r = Path.normalize(p + f);
			if (isFolder) {
				if (folders.indexOf(r) < 0) folders.push(r);
			}
			else {
				let q = Path.dirname(r);
				if (folders.indexOf(q) < 0) folders.push(q);
				if (files.indexOf(r) < 0) files.push(r);
			}
		});
	});

	var stats, result;
	logger.log(setStyle('开始创建文件', 'green bold'));
	stats = await fs.filterPath(folders); // 检查路径是否存在是否是文件
	result = await fs.createFolders(stats.nonexist, logger); // 批量创建不存在的路径
	stats.changed = result.success;
	stats.failed = result.failed;
	logger.log(setStyle('目录已创建', 'green bold'));
	omniHistory.record(stats.changed, stats.failed);
	folders = [];
	stats.folders.forEach(path => folders.push(path));
	stats.changed.forEach(path => folders.push(path));
	stats.unavailableFiles = [];
	// 过滤可以创建的文件路径
	files = files.filter(path => {
		var available = folders.some(p => path.indexOf(p) === 0);
		if (!available) stats.unavailableFiles.push(path);
		return available;
	});
	stats.fileStats = await fs.filterPath(files); // 检查路径是否存在是否是文件
	result = await fs.createEmptyFiles(stats.fileStats.nonexist, logger); // 批量创建不存在的文件
	stats.fileStats.changed = result.success;
	stats.fileStats.failed = result.failed;
	stats.unavailableFiles.forEach(path => stats.fileStats.failed.push(path));
	omniHistory.record(stats.fileStats.changed, stats.fileStats.failed);
	logger.log(setStyle('文件创建完成', 'green bold'));
	if (stats.changed.length > 0) logger.log('    ' + setStyle('共创建' + stats.changed.length + '个目录', 'blue bold'));
	if (stats.fileStats.changed.length > 0) logger.log('    ' + setStyle('共创建' + stats.fileStats.changed.length + '个文件', 'blue bold'));
	if (stats.failed.length > 0) logger.log('    ' + setStyle('共创建失败' + stats.failed.length + '个目录', 'red bold'));
	if (stats.fileStats.failed.length > 0) logger.log('    ' + setStyle('共创建失败' + stats.fileStats.failed.length + '个文件', 'red bold'));

	handcraftCreating = false;

	res();
	if (cb instanceof Function) cb();
});
var deleteFilesAndFolders = (group, paths, force, cb) => new Promise(async (res, rej) => {
	handcraftCreating = true;

	var files = [], range, stat;
	// 获取真实路径
	if (!!group) {
		range = group.range;
		paths.forEach(f => {
			f = '/' + f.replace(/^\/+/, '').trim();
			range.forEach(p => {
				files.push(Path.normalize(p + f));
			});
		});
	}
	else {
		files = paths.map(p => p.replace(/^~[\/\\]/, process.env.HOME + Path.sep));
	}
	stat = await fs.filterPath(files); // 拆分出文件和目录
	if (stat.files.length + stat.folders.length === 0) {
		logger.log(setStyle('无文件或目录需要删除', 'green bold'));
		await waitTick();
		handcraftCreating = false;
		res();
		if (cb instanceof Function) cb();
		return;
	}
	paths = [];
	stat.files.forEach(f => paths.push(f));
	stat.folders.forEach(f => paths.push(f));

	// 找出所有组中被同步到的所有文件与文件夹
	var changed = true;
	var trees = {};
	for (let g in syncGroups) {
		if (syncGroups[g].mode !== WatchMode.FOLDER) continue;
		let tree = syncGroups[g].tree;
		trees[g] = tree.map(t => t[0]);
	}
	while (changed) {
		changed = false;
		for (let gname in syncGroups) {
			let g = syncGroups[gname];
			if (g.mode !== WatchMode.FOLDER) continue;
			g = g.map.source;
			g.forEach(path => paths.forEach(p => {
				if (p.indexOf(path) === 0) {
					var target = p.substring(path.length, p.length); // 截取组中相对路径
					if (trees[gname].indexOf(target) < 0 && trees[gname].indexOf(target + '/') < 0) return; // 判断是否是组中已有元素，因为可能被ignore了
					g.forEach(q => {
						q = q + target;
						if (paths.indexOf(q) < 0) {
							changed = true;
							paths.push(q);
						}
					});
				}
			}));
		}
	}

	var changed = [], failed = [];
	// 筛选出文件与文件夹
	stat = await fs.filterPath(paths);
	// 删除所有文件
	files = await fs.deleteFiles(stat.files, logger);
	files.success.forEach(p => changed.push(p));
	files.failed.forEach(p => failed.push(p));
	// 删除所有文件夹
	files = await fs.deleteFolders(stat.folders, force, logger);
	files.success.forEach(p => changed.push(p));
	files.failed.forEach(p => failed.push(p));

	omniHistory.record(changed, failed);
	logger.log(setStyle('文件与目录删除完成', 'green bold'));
	if (changed.length > 0) logger.log('    ' + setStyle('共删除' + changed.length + '个文件与目录', 'blue bold'));
	if (failed.length > 0) logger.log('    ' + setStyle('共删除失败' + failed.length + '个文件与目录', 'red bold'));

	handcraftCreating = false;

	res();
	if (cb instanceof Function) cb();
});
var copyFilesFromOutside = (source, target, group, force, cb) => new Promise(async (res, rej) => {
	handcraftCreating = true;

	var range = group.range, files = [];
	source = source.replace(/^~[\/\\]/, process.env.HOME + Path.sep);
	target = target.replace(/^[\/\\]/, '');
	range.forEach(path => files.push(path + Path.sep + target));

	var count = files.length, changed = [], failed = [];
	var finish = () => {
		handcraftCreating = false;
		res();
		if (cb instanceof Function) cb();
	};
	if (count === 0) {
		await waitTick();
		finish();
	}
	else files.forEach(async target => {
		logger.log(setStyle('复制文件：', 'green bold') + '从 ' + source + ' 到 ' + target);
		var err = await duplicateFile(source, target);
		if (!!err) {
			failed.push(target);
			logger.error(err.message);
		}
		else {
			changed.push(target);
		}
		count --;
		if (count > 0) return;
		omniHistory.record(changed, failed);
		logger.log(setStyle('复制文件完成', 'green bold'));
		if (changed.length > 0) logger.log('    ' + setStyle('共复制' + changed.length + '个文件、目录', 'blue bold'));
		if (failed.length > 0) logger.log('    ' + setStyle('共复制失败' + failed.length + '个文件、目录', 'red bold'));
		finish();
	});
});

// 主业务
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
var stopMission = () => {
	razeAllWatchers();
	if (!!deamonWatch) clearTimeout(deamonWatch);
};
var revokeMission = (notFirstLaunch, cb) => new Promise(async (res, rej) => {
	stopMission();
	await launchMission(notFirstLaunch);
	res();
	if (cb instanceof Function) cb();
});
var launchMission = async notFirstLaunch => {
	var log, message = [''];
	if (!!notFirstLaunch) {
		log = text => message.push(text);
	}
	else {
		log = text => {
			changePrompt(syncConfig.syncPrompt);
			logger.log(text);
			changePrompt();
		};
	}

	log('开始分析目录组......');
	syncGroups = await initialGroups(syncConfig.group);

	log('目录分析完成，开始同步......');
	var changeList = [{}, {}, [], []], list = [0, 0, [0], [0]];
	for (let group in syncGroups) {
		changeList[0][group] = [];
		changeList[1][group] = [];
	}
	while (list[2].length + list[3].length > 0) {
		list = await launchSync(syncGroups);
		if (list[2].length + list[3].length === 0) break;

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
		omniHistory.record(changeList[2], changeList[3]);

		log('有变更，重新分析分组......');
		syncGroups = await initialGroups(syncConfig.group);
	}

	log('同步完成......');
	log(setStyle(setStyle('同步成功 ', 'bold') + changeList[2].length + ' 个文件', 'green'));
	log(setStyle(setStyle('同步失败 ', 'bold') + changeList[3].length + ' 个文件', 'magenta'));
	var hasChange = 0;
	for (let group in syncGroups) {
		let changed = changeList[0][group].length;
		let failed = changeList[1][group].length;
		if (changed + failed === 0) continue;
		hasChange += changed + failed;
		let message = setStyle(setStyle('同步 ' + group + '： ', 'bold') + (changed + failed) + ' 个文件/目录', 'underline')
		if (changed > 0) message += '\n            ' + setStyle(setStyle('同步成功： ', 'bold') + changed + ' 个文件/目录', 'green');
		if (failed > 0) message += '\n            ' + setStyle(setStyle('同步失败： ', 'bold') + failed + ' 个文件/目录', 'magenta');
		log(message);
	}
	hasChange = hasChange > 0;

	if (!!notFirstLaunch && hasChange) {
		changePrompt(syncConfig.syncPrompt);
		logger.log(message.join('\n        '));
		changePrompt();
	}

	if (syncConfig.deamon && !stopPatrol) {
		watchTrees(syncGroups);
		if (!!deamonWatch) clearTimeout(deamonWatch);
		deamonWatch = setTimeout(() => {
			changePrompt(syncConfig.syncPrompt);
			logger.log(setStyle('定时更新喽~~~', 'blue bold') + '      ' + timeNormalize());
			changePrompt();
			launchMission(true);
		}, syncConfig.duration * 1000);
	}
};
var launchShowDiff = async () => {
	var log = console.log;

	log('开始分析目录组......');
	syncGroups = await initialGroups(syncConfig.group);

	log(setStyle('文件同步状态：', 'bold underline'));
	for (let group in syncGroups) {
		group = syncGroups[group];
		let tree = group.tree;
		tree = tree.filter(file => file[1] !== SyncState.SYNCED);
		if (tree.length === 0) continue;
		if (group.mode === WatchMode.FILE) {
			return;
			log('    ' + setStyle('文件同步：', 'bold') + ' ' + group.name);
			tree.map(path => {
				var len = getCLLength(path[0]), vlen = len + 2;
				vlen = Math.ceil(vlen / syncConfig.mapPaddingLevel) * syncConfig.mapPaddingLevel;
				if (vlen < syncConfig.mapPaddingLeft) vlen = syncConfig.mapPaddingLeft;
				log('        ' + path[0] + String.blank(vlen - len) + ' | ' + SyncState.toString(path[1], true));
			});
		}
		else if (group.mode === WatchMode.FOLDER) {
			log('    ' + setStyle('目录同步：', 'bold') + ' ' + group.name);
			tree = tree.filter(path => path[2] === WatchMode.FILE);
			tree.map(path => {
				var len = getCLLength(path[0]), vlen = len + 2;
				vlen = Math.ceil(vlen / syncConfig.mapPaddingLevel) * syncConfig.mapPaddingLevel;
				if (vlen < syncConfig.mapPaddingLeft) vlen = syncConfig.mapPaddingLeft;
				log('        ' + path[0] + String.blank(vlen - len) + ' | ' + SyncState.toString(path[1], true));
			});
		}
	}
};

// 任务管理
var missionPipe = new global.Utils.Events.Pipe();
var taskRefresh = () => new Promise(async (res, rej) => {
	await revokeMission();
	res();
});
var taskShowList = (group, path, showAll) => new Promise(async (res, rej) => {
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
		res();
		return;
	}

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
			res();
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

	res();
});
var taskShowHealth = (duration, interval, stop) => new Promise(async (res, rej) => {
	var delay = 100, progress = 0;
	if (delay > duration) delay = duration / 10;
	rtmLauncher.cli.waitProcessbar('获取同步者健康状态', 100, 1);
	var timer = setInterval(() => {
		progress += delay;
		rtmLauncher.cli.updateProcessbar(0, progress / duration);
		if (progress >= duration) {
			if (timer) clearInterval(timer);
			timer = null;
		}
	}, delay);
	getHealth(duration, async result => {
		rtmLauncher.cli.updateProcessbar(0, 1);
		if (timer) clearInterval(timer);
		timer = null;
		await waitTick();
		showHealth(result, rtmLauncher);
		res();
	});
	if (!isNaN(interval)) {
		if (!!healthWatcher) clearInterval(healthWatcher);
		healthWatcher = setInterval(async () => {
			var result = await getHealth(duration * 1000);
			showHealth(result, rtmLauncher);
		}, interval * 1000);
	}
	else if (stop) {
		if (!!healthWatcher) clearInterval(healthWatcher);
	}
});
var taskShowStatus = () => new Promise(async (res, rej) => {
	var message = [ setStyle('当前同步者配置：', 'bold') ], title, padding = 20;
	title = '配置文件地址：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + syncConfig.file);
	title = '巡视者模式：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + (syncConfig.deamon ? setStyle('开启', 'green') : '关闭'));
	title = '静默模式：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + (syncConfig.silence ? setStyle('开启', 'green') : '关闭'));
	title = '失聪模式：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + (syncConfig.deaf ? setStyle('开启', 'green') : '关闭'));
	title = '巡视间隔：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + syncConfig.duration + '秒');
	title = '巡视延迟：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + syncConfig.delay + '秒');
	title = '漠视模式：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + (syncConfig.ignore ? setStyle('开启', 'green') : '关闭'));
	title = '网络值守模式：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + (syncConfig.web ? setStyle('开启', 'green') : '关闭'));
	title = 'Socket值守模式：';
	message.push('    ' + setStyle(title, 'bold') + String.blank(padding - getCLLength(title)) + (syncConfig.socket ? setStyle('开启', 'green') : '关闭'));
	message.push('    分组情况请用 list 命令查看。');
	logger.log(message.join('\n'));
	res();
});
var taskShowHistory = showAll => new Promise(async (res, rej) => {
	var history, title, message = [];
	if (showAll) {
		title = '所有修改历史：';
		history = omniHistory.recall(true);
	}
	else {
		title = '上次修改记录：';
		history = omniHistory.recall(false);
	}
	message.push(setStyle(title, 'bold underline'));
	message.push('    ' + setStyle('同步成功文件：', 'green bold'));
	history.changed.map(path => {
		var p = path[0];
		if (p.indexOf(process.env.HOME) === 0) p = p.replace(process.env.HOME, '~');
		var line = getCLLength(p), vlen = line + 2, len = 120;
		if (len < vlen) len = Math.ceil(vlen / 20) * 20;
		message.push('        ' + p + String.blank(len - line) + '（' + timeNormalize(path[1]) + '）');
	});
	message.push('    ' + setStyle('同步失败文件：', 'red bold'));
	history.failed.map(path => {
		var line = getCLLength(p), vlen = line + 2, len = 120;
		if (len < vlen) len = Math.ceil(vlen / 20) * 20;
		message.push('        ' + p + String.blank(len - line) + '（' + timeNormalize(path[1]) + '）');
	});
	logger.log(message.join('\n'));
	res();
});
var taskStopMission = () => new Promise(async (res, rej) => {
	logger.log(setStyle('停止巡视', 'bold'));
	stopPatrol = true;
	stopMission();
	res();
});
var taskStartMission = () => new Promise(async (res, rej) => {
	logger.log(setStyle('开始巡视', 'bold'));
	stopPatrol = false;
	revokeMission();
	res();
});

// 初始化命令行解析
var cmdLauncher = clp({
	title: SyncerTitle + ' v' + SyncerVersion,
	mode: 'process'
})
.describe('多文件夹自动同步者。\n' + setStyle('当前版本：', 'bold') + 'v' + SyncerVersion)
.addOption('--config -c <config> >> 配置文档地址')
.addOption('--showdiff -sd >> 只查看变更结果')
.addOption('--ignore -i >> 是否忽略删除')
.addOption('--deamon -d [duration(^\\d+$|^\\d+\\.\\d*$)=10] >> 是否启用监控模式，可配置自动监控时间间隔，默认时间为十分钟')
.addOption('--deaf -df >> 失聪模式')
.addOption('--delay -dl <delay> >> 巡视后行动延迟时长')
.addOption('--silence -s >> 不启用命令行控制面板')
.addOption('--web -w >> 启用Web后台模式' + setStyle('【待开发】', ['green', 'bold']))
.addOption('--socket -skt >> 启用Socket后台模式' + setStyle('【待开发】', ['green', 'bold']))
.on('command', params => {
	if (!!params.config) syncConfig.file = params.config;
	if (!!params.showdiff) syncConfig.showdiff = params.showdiff;
	if (!!params.deaf) syncConfig.deaf = params.deaf;
	if (!!params.ignore) syncConfig.ignore = params.ignore;
	if (!!params.deamon) {
		syncConfig.deamon = params.deamon;
		syncConfig.silence = false;
	}
	if (!isNaN(params.duration)) syncConfig.duration = params.duration * 60;
	if (!isNaN(params.delay)) syncConfig.delay = params.delay;
	if (!!params.silence) syncConfig.silence = true;
	if (!!params.web) {
		syncConfig.web = params.web;
		logger.error('Web服务模式暂未开启，敬请期待~~');
	}
})
.on('done', async params => {
	if (params.help) return;
	var config, configFile = syncConfig.file;
	try {
		config = await readJSON(syncConfig.file);
	}
	catch (err) {
		configFile = configPath;
		try {
			config = await readJSON(configPath);
		}
		catch (e) {
			configFile = null;
			config = {};
		}
	}

	syncConfig.deamon = syncConfig.deamon || config.deamonMode || false;
	syncConfig.duration = syncConfig.duration || config.monitor || deamonDuration;
	syncConfig.delay = syncConfig.delay || config.delay || deamonDelay;
	syncConfig.silence = syncConfig.silence || config.silence || !syncConfig.deamon;
	syncConfig.deaf = syncConfig.deaf || config.deaf || false;
	syncConfig.web = syncConfig.web || config.web || false;
	syncConfig.syncPrompt = config.syncPrompt || syncConfig.syncPrompt;
	syncConfig.mapPaddingLeft = config.mapPaddingLeft || syncConfig.mapPaddingLeft;
	syncConfig.mapPaddingLevel = config.mapPaddingLevel || syncConfig.mapPaddingLevel;
	syncConfig.ignores = config.ignore || [];
	syncConfig.group = config.group || {};

	syncConfig.ignores = generateIgnoreRules(syncConfig.ignores);
	for (let group in syncConfig.group) {
		syncConfig.group[group] = syncConfig.group[group].map(path => path.replace(/^~/, process.env.HOME));
	}

	if (syncConfig.showdiff) {
		launchShowDiff();
		return;
	}

	if (!syncConfig.silence) {
		rtmLauncher.launch();

		logger.info = (...args) => { args.map(arg => rtmLauncher.showHint(arg)) };
		logger.log = (...args) => { args.map(arg => rtmLauncher.showHint(arg)) };
		logger.warn = (...args) => { args.map(arg => rtmLauncher.showError(arg)) };
		logger.error = (...args) => { args.map(arg => rtmLauncher.showError(arg)) };
	}

	if (syncConfig.deamon && !!configFile) configWatch = fs.watch(configFile, async stat => {
		changePrompt(syncConfig.syncPrompt);
		logger.log(setStyle('配置文件改变，重新启动巡视者~~~', 'blue bold') + '      ' + timeNormalize());
		changePrompt();
		clearTimeout(deamonWatch);
		var config;
		try {
			config = await readJSON(configFile);
		}
		catch (err) {
			config = null;
		}

		if (!!config) {
			syncConfig.ignores = config.ignore;
			syncConfig.ignores = generateIgnoreRules(syncConfig.ignores);
			syncConfig.group = config.group;
			for (let group in syncConfig.group) {
				syncConfig.group[group] = syncConfig.group[group].map(path => path.replace(/^~/, process.env.HOME));
			}
		}

		launchMission(true);
	});

	launchMission();
})
;

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
	title: SyncerTitle + ' v' + SyncerVersion,
	mode: 'cli',
	hint: {
		welcome: setStyle('欢迎来到同步空间~', 'yellow underline bold'),
		byebye: setStyle('世界，终结了。。。', 'magenta bold')
	}
})
.describe('多文件夹自动同步者。\n' + setStyle('当前版本：', 'bold') + 'v' + SyncerVersion)
.add('refresh|re >> 强制同步更新')
.add('start|st >> 开始巡视模式')
.add('stop|sp >> 停止巡视模式')
.add('list|lt >> 显示当前分组同步信息')
.addOption('--group -g <group> >> 指定group标签后可查看指定分组下的源情况')
.addOption('--files -f <path> >> 查看指定路径下的文件列表')
.addOption('--all -a >> 显示所有文件与文件夹，不打开则只显示有变化的文件与文件夹')
.add('delete|del [...files] >> 删除文件列表')
.addOption('--force -f >> 强制删除整个目录')
.addOption('--group -g <group> >> 指定分组')
.add('create|new [...files] >> 创建文件列表')
.addOption('--group -g <group> >> 指定分组')
.addOption('--folder -f >> 指定创建的是文件夹')
.add('copy|cp <source> <target> >> 从外源复制文件进来')
.addOption('--group -g <group> >> 指定分组')
.addOption('--force -f >> 强制覆盖文件')
.add('health|ht [duration(^\\d+$|^\\d+\\.\\d*$)=1] >> 查看当前 CPU 与 MEM 使用状态，统计时长单位为秒')
.addOption('--interval -i [interval(^\\d+$|^\\d+\\.\\d*$)=1] >> 定式更新，更新间隔单位为秒')
.addOption('--stop -s >> 定制定式更新')
.add('history|his >> 查看更新文件历史')
.addOption('--all -a >> 查看启动以来的更新文件历史')
.add('status|stt >> 显示当前配置')
.on('command', (param, command) => {
	if (Object.keys(param).length > 1) return;
	if (param.mission.length > 0) return;
	logger.error('不存在该指令哦！输入 help 查看命令~');
})
.on('done', async params => {
	missionPipe.launch();
})
.on('quit', (param, command) => {
	if (!!healthWatcher) {
		clearInterval(healthWatcher);
		changePrompt(syncConfig.syncPrompt);
		logger.log('结束监控者。。。');
		changePrompt();
	}
	razeAllWatchers();
	if (!!deamonWatch) {
		clearTimeout(deamonWatch);
		if (configWatch) configWatch.close();
		configWatch = null;
		changePrompt(syncConfig.syncPrompt);
		logger.log('结束巡视者。。。');
		changePrompt();
	}
	param.msg = '同步者已死……';
})
.on('exit', (param, command) => {
	changePrompt(setStyle(syncConfig.syncPrompt, 'red bold'));
	logger.log(setStyle('世界崩塌中。。。', 'red bold'));
	changePrompt();
	setTimeout(function () {
		changePrompt(setStyle(syncConfig.syncPrompt, 'red bold'));
		logger.log(setStyle('世界已重归虚无。。。', 'red bold'));
		changePrompt();
		process.exit();
	}, 200);
})
.on('refresh', (param, all, command) => {
	missionPipe.add(taskRefresh);
})
.on('list', (param, all, command) => {
	var group = param.group;
	var path = param.path;
	var showAll = !!param.all;
	missionPipe.add(taskShowList, group, path, showAll);
})
.on('health', (param, all, command) => {
	var duration = param.duration * 1000;
	var interval = param.interval;
	var stop = param.stop;
	missionPipe.add(taskShowHealth, duration);
})
.on('status', (param, all, command) => {
	missionPipe.add(taskShowStatus);
})
.on('history', (param, all, command) => {
	var showAll = !!param.all;
	missionPipe.add(taskShowHistory);
})
.on('create', async (param, all, command) => {
	var group = param.group;
	if (!group) {
		command.showError('所属分组参数不能为空！');
		return;
	}
	group = syncGroups[group];
	if (!group) {
		command.showError('所选分组不存在！');
		return;
	}
	if (group.mode === WatchMode.NOTREADY) {
		command.showError('所选分组检测中，请稍后再试！');
		return;
	}
	if (group.mode === WatchMode.WRONG) {
		command.showError('所选分组异常！');
		return;
	}
	if (group.mode === WatchMode.FILE) {
		command.showError('不可在文件同步组里创建文件/目录！');
		return;
	}
	var paths = param.files;
	if (!paths || paths.length === 0) {
		command.showError('不可没有目标路径！');
		return;
	}

	missionPipe.add(createFilesAndFolders, group, paths, !!param.folder);
	missionPipe.add(revokeMission, true);
})
.on('delete', async (param, all, command) => {
	var paths = param.files;
	if (!paths || paths.length === 0) {
		command.showError('不可没有目标路径！');
		return;
	}
	var group = param.group, force = !!param.force;

	missionPipe.add(deleteFilesAndFolders, syncGroups[group], paths, force);
	missionPipe.add(revokeMission, true);
})
.on('copy', async (param, all, command) => {
	var group = param.group;
	if (!group) {
		command.showError('所属分组参数不能为空！');
		return;
	}
	group = syncGroups[group];
	if (!group) {
		command.showError('所选分组不存在！');
		return;
	}
	if (group.mode === WatchMode.NOTREADY) {
		command.showError('所选分组检测中，请稍后再试！');
		return;
	}
	if (group.mode === WatchMode.WRONG) {
		command.showError('所选分组异常！');
		return;
	}
	if (group.mode === WatchMode.FILE) {
		command.showError('不可往文件同步组里复制文件/目录！');
		return;
	}
	var source = param.source;
	if (!source) {
		command.showError('不可没有源文件路径！');
		return;
	}
	var target = param.target;
	if (!target) {
		command.showError('不可没有目标文件路径！');
		return;
	}

	missionPipe.add(copyFilesFromOutside, source, target, group, !!param.force);
	missionPipe.add(revokeMission, true);
})
.on('stop', (param, all, command) => {
	missionPipe.add(taskStopMission);
})
.on('start', (param, all, command) => {
	missionPipe.add(taskStartMission);
})
;

cmdLauncher.launch();