/**
 * Name:	Aync Pipe Manager
 * Desc:    异步事件管道
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.19
 */

const EM = require('../eventManager');

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
			get: () => pipe
		});
		reverse = !!reverse;
		Object.defineProperty(this, 'reverse', {
			configurable: false,
			get: () => reverse
		});
	}
	add (task) {
		if (task instanceof Array) {
			task = task.filter(t => t instanceof Function);
			this.pipe.splice(this.pipe.length, 0, ...task);
		}
		else if (task instanceof Function) {
			this.pipe.push(task);
		}
		return this;
	}
	launch (...args) {
		return new Promise(async (res, rej) => {
			var event = new PipeEvent(this);
			args.push(event);
			while (this.pipe.length > 0) {
				var task;
				if (this.reverse) task = this.pipe.pop();
				else task = this.pipe.shift();
				event.update();
				await task(...args);
				this.onStep(pipe);
			}
			this.onDone(pipe);
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