/**
 * Name:	Thread Manager
 * Desc:    辅助工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.09.21
 *
 * 基于 WebWorker-Threads 的线程管理中心
 * 实现分组线程池
 */

// 对WebWorker-Threads的拓展
const Thread = require('webworker-threads');
Thread._create = Thread.create;
Thread.create = () => {
	var thread = Thread._create();
	thread.call = (func, ...args) => {
		var cb = args.pop();
		args = JSON.stringify(args);
		args = args.substring(1, args.length - 1);
		return thread.eval("(" + func + ")(" + args + ")", cb);
	};
	return thread;
};
Thread._createPool = Thread.createPool;
Thread.createPool = n => {
	var pool = Thread._createPool(n);
	pool.any.call = (func, ...args) => {
		var cb = args.pop();
		args = JSON.stringify(args);
		args = args.substring(1, args.length - 1);
		return pool.any.eval("(" + func + ")(" + args + ")", cb);
	};
	pool.all.call = (func, ...args) => {
		var cb = args.pop();
		args = JSON.stringify(args);
		args = args.substring(1, args.length - 1);
		return pool.all.eval("(" + func + ")(" + args + ")", cb);
	};
	return pool;
};

// 线程池参数
const CPUCount = require('os').cpus().length;
const ThreadPerCPU = 5;
const PoolLimit = CPUCount * ThreadPerCPU;

const elfSoul = __dirname + '/threads/threadWorker.js';

// 封装的Worker类
class Deacon {
	constructor (freeWorld, battleField, soul, ghosts, loglev) {
		this.freeWorld = freeWorld;
		this.battleField = battleField;
		var ego = this;
		loglev = loglev || 0;
		var logger = global.logger(loglev);
		soul = soul || elfSoul;
		ego.soul = new Thread.Worker(soul);
		ego.soul.isfree = true;
		ego.soul.onmessage = msg => {
			msg = msg.data;
			if (!!ego.messager) {
				if (msg.action === 'complete') {
					ego.soul.isfree = true;
					var index = ego.battleField.indexOf(ego);
					if (index >= 0) ego.battleField.splice(index, 1);
					ego.freeWorld.push(ego);
					if (!!ego.reaper) ego.reaper({
						quest: msg.quest,
						msg: msg.data
					});
					ego.messager = null;
					ego.reaper = null;
				}
				else if (msg.action === 'message') {
					if (!!ego.messager) ego.messager({
						quest: msg.quest,
						msg: msg.msg
					});
				}
			}
		};
		ego.soul.thread.on('error', err => {
			logger.error("Thread " + ego.soul.thread.id + " Error: (" + err.type + ")");
			logger.error(err.msg);
			logger.error(err.data);
		});
		ego.soul.postMessage({
			action: 'init',
			path: __dirname,
			filelist: ghosts,
			loglev: loglev
		});
		ego.freeWorld.push(ego);
	}
	get isFree () {
		return this.soul.isfree;
	}
	dispatch (quest, data, messager, reaper) {
		this.messager = messager;
		this.reaper = reaper;
		this.soul.isfree = false;
		var index = this.freeWorld.indexOf(this);
		if (index >= 0) this.freeWorld.splice(index, 1);
		this.battleField.push(this);
		this.soul.postMessage({
			action: 'quest',
			quest: quest,
			data: data
		});
		return this;
	}
	submit (msg) {
		this.soul.postMessage({
			action: 'message',
			data: msg
		});
		return this;
	}
	suicide () {
		if (!this.soul.isfree) return false;
		this.soul.isfree = false;
		this.freeWorld.splice(this.freeWorld.indexOf(this), 1);
		this.soul.terminate();
		return true;
	}
	attach (script) {
		var len = script.length;
		if (script.indexOf('\n') >= 0 || script.substring(len - 3, len).toLowerCase() !== '.js') {
			this.soul.thread.eval(script);
		}
		else {
			this.soul.thread.load(script);
		}
	}
	onmessage (cb) {
		this.messager = cb;
		return this;
	}
	onfinish (cb) {
		this.reaper = cb;
		return this;
	}
}

var PoolSize = 0;
var group = {};
const ThreadPool = {
	init:  (option) => {
		if (!option) option = {};
		var total_size = 0;
		var group_count = 0;
		for (let g in option) {
			total_size += option[g];
			group_count += 1;
		}
		var default_size = 0;
		if (total_size < PoolLimit) { // 剩余的作为默认线程池
			default_size = PoolLimit - total_size;
		}
		else if (group_count > PoolLimit) { // 全部放在默认线程池中
			default_size = PoolLimit;
			for (let g in option) option[g] = 0;
		}
		else {

		}
		console.log(total_size, group_count, PoolLimit);
	},
	initxxx: (size) => {
		if (isNaN(size)) size = PoolLimit;
		else {
			size = Math.floor(size);
			if (size > PoolLimit) size = PoolLimit;
			else if (size < 1) size = 1;
		}
		PoolSize = size;
		this.group = {
			default: {
				size: size,
				free: [],
				busy: []
			}
		};
	},
	alloc: (alloc) => {

	},
	get size () {
		return PoolSize;
	},
	get SizeLimit () {
		return PoolLimit;
	}
};
ThreadPool.addTask = (order, task) => {

};

ThreadPool.init({
	deamon: 13,
	hulk: 24,
	ironman: 11
});

ThreadPool.Thread = Thread;

module.exports.ThreadPool = ThreadPool;
global.Utils = global.Utils || {};
global.Utils.ThreadPool = ThreadPool;