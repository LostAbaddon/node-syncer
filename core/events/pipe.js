/**
 * Name:	Aync Pipe Manager
 * Desc:    异步事件管道
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.19
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
	constructor (reverse) {
		new EM(this, [
			'step',
			'done'
		]);
		var pipe = [];
		Object.defineProperty(this, 'pipe', {
			configurable: false,
			enumerable: false,
			get: () => pipe
		});
		reverse = !!reverse;
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
}

module.exports = Pipe;
global.Utils = global.Utils || {};
global.Utils.Events = global.Utils.Events || {};
global.Utils.Events.Pipe = Pipe;