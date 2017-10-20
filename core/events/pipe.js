/**
 * Name:	Aync Pipe Manager
 * Desc:    异步事件管道
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.20
 */

const EM = require('../eventManager');

const private = new WeakMap();
class PipeEvent extends EM.EventData {
	constructor (pipe) {
		super('pipeEvent', pipe);
		this.index = 0;
		this.total = pipe.length;
	}
	update () {
		this.total = this.target.length;
		this.timestamp = new Date();
	}
}
class Pipe {
	constructor (reverse = false) {
		new EM(this, [
			'start',
			'step',
			'done'
		]);
		var pipe = [];
		Object.defineProperty(this, 'pipe', {
			configurable: false,
			enumerable: false,
			get: () => pipe
		});
		Object.defineProperty(this, 'reverse', {
			configurable: false,
			enumerable: false,
			get: () => reverse
		});
		var running = false;
		Object.defineProperty(this, 'running', {
			enumerable: false,
			get: () => running,
			set: value => running = value
		});
	}
	add (task, ...args) {
		if (!(task instanceof Function)) return this;
		this.pipe.push([task, args]);
		return this;
	}
	launch () {
		return new Promise(async (res, rej) => {
			if (this.running) return;
			this.running = true;
			var event = new PipeEvent(this);
			this.onStart(event);
			while (this.pipe.length > 0) {
				let task;
				if (this.reverse) task = this.pipe.pop();
				else task = this.pipe.shift();
				let args = task[1];
				task = task[0];
				event.update();
				args.push(event);
				await task(...args);
				this.onStep(event);
			}
			this.onDone(event);
			this.running = false;
			res();
		});
	}
	get length () {
		return this.pipe.length;
	}
	copy () {
		var duplicate = new Pipe(this.reverse);
		this.pipe.forEach(task => duplicate.add(task[0], ...task[1]));
		return duplicate;
	}
}

class BarrierKey {
	constructor (barrier) {
		if (!(barrier instanceof Barrier)) return;
		this.barrier = barrier;
		this.key = Symbol();
	}
	open () {
		this.barrier.solve(this);
		return this;
	}
}
class Barrier {
	constructor () {
		new EM(this, [
			'active',
			'step',
			'done'
		]);
		var barrier = [];
		Object.defineProperty(this, 'barrier', {
			configurable: false,
			enumerable: false,
			get: () => barrier
		});
		var worker = [];
		Object.defineProperty(this, 'worker', {
			configurable: false,
			enumerable: false,
			get: () => worker
		});
	}
	request () {
		var key = new BarrierKey(this);
		this.barrier.push(key.key);
		return key;
	}
	active () {
		if (this.worker.length > 0) return this;
		this.barrier.forEach(b => this.worker.push(b));
		this.worker.waiters = [];
		this.onActive(this);
		return this;
	}
	solve (key) {
		return new Promise((res, rej) => {
			if (!(key instanceof BarrierKey)) {
				res();
				return;
			}
			var index = this.worker.indexOf(key.key);
			if (index < 0) {
				res();
				return;
			}
			this.worker.splice(index, 1);
			this.worker.waiters.push(res);
			this.onStep(this);
			if (this.worker.length === 0) {
				this.worker.waiters.forEach(res => res());
				this.worker.waiters.splice(0, this.worker.waiters.length);
				this.onDone(this);
			}
		});
	}
	get length () {
		return this.barrier.length;
	}
	get waiting () {
		return this.worker.length;
	}
	copy () {
		var duplicate = new Barrier();
		this.barrier.forEach(b => duplicate.barrier.push(b));
		return duplicate;
	}
}

module.exports = Pipe;
global.Utils = global.Utils || {};
global.Utils.Events = global.Utils.Events || {};
global.Utils.Events.Pipe = Pipe;
global.Utils.Events.Barrier = Barrier;