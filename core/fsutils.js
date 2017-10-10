/**
 * Name:	FileSystem Utils
 * Desc:    文件系统工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.02
 * Note:	mkfolder函数可创建指定目录，且如果该目录的父目录不存在则一并创建。主要解决多个目录同时创建时异步导致的重复创建问题
 * 			存在的问题：创建过程中删除父目录，会导致创建失败
 * 			[TODO]未来有更好的任务管理模块时替换这部分
 */

const fs = require('fs');
const Path = require('path');

const IDLE = Symbol('IDLE');
const BUSY = Symbol('BUSY');
const FREE = Symbol('FREE');
const DIED = Symbol('DIED');

var manager = {
	tasks: {},
	status: IDLE,
	hooks: {},
	prepare: {}
};

fs.mkfolder = (path, cb) => new Promise(async (resolve, reject) => {
	path = Path.normalize(path);
	path = path.replace(new RegExp(Path.sep + '+$'), '');
	path = path.split(Path.sep);
	var p = '';
	var tasks = [];
	path.map(f => {
		p += f;
		if (p.length > 0) { // 注册任务
			tasks.push(p);
		}
		p += Path.sep;
	});
	var err = await mkfTask(tasks);
	if (!!err) {
		reject(err);
		if (!!cb) cb(err);
	}
	else {
		resolve();
		if (!!cb) cb();
	}
});
var mkfTask = pool => new Promise((resolve, reject) => {
	var path = pool[pool.length - 1];
	manager.hooks[path] = err => {
		if (!err) resolve();
		else resolve(err);
	};
	manager.prepare[path] = pool;
	pool.map(p => {
		var list = [];
		pool.some(q => {
			if (p === q) return true;
			list.push(q);
		});
		manager.prepare[p] = list;
	});
	pool.map(p => {
		if (!manager.tasks[p]) manager.tasks[p] = IDLE;
	});
	if (manager.status === BUSY) return;
	manager.status = BUSY;
	mkLoop();
});
var mkLoop = () => {
	var keys = Object.keys(manager.tasks);
	keys.sort((ka, kb) => ka > kb ? 1 : -1);
	var done = true;
	keys.map(async path => {
		var status = manager.tasks[path];
		// 若已完成某项工作，检查是否有回调
		if (status === FREE || status === DIED) return;
		done = false;
		// 某项工作尚未开始
		if (status === IDLE) {
			// 检查是否存在该目录
			manager.tasks[path] = BUSY;
			fs.stat(path, (err, stat) => {
				if (!err) { // 顺利结束
					manager.tasks[path] = FREE;
					let cb = manager.hooks[path];
					if (!!cb) cb();
					mkLoop();
					return;
				}
				// 检查上级目录情况
				var shouldWait = false, canBuild = true;
				var prepares = manager.prepare[path];
				prepares.map(p => {
					var status = manager.tasks[p];
					if (status === IDLE || status === BUSY) {
						shouldWait = true;
						canBuild = false
						return;
					}
					else if (status === DIED) {
						canBuild = false;
					}
				});
				if (shouldWait) { // 有上级目录尚未创建，等待
					manager.tasks[path] = IDLE;
				}
				else if (canBuild) { // 都已准备好，创建
					fs.mkdir(path, (err, stat) => {
						var cb = manager.hooks[path];
						if (!!err) {
							manager.tasks[path] = DIED;
							if (!!cb) cb(err);
						}
						else {
							manager.tasks[path] = FREE;
							if (!!cb) cb();
						}
						mkLoop();
					});
				}
				else { // 上级目录都已创建，报错
					manager.tasks[path] = DIED;
					let cb = manager.hooks[path];
					if (!!cb) cb(err);
				}
				mkLoop();
			});
		}
	});
	// 清除工作状态
	if (done) {
		manager.status = IDLE;
		manager.tasks = {};
		manager.hooks = {};
		manager.prepare = {};
	}
};