/**
 * Name:	Event Manager
 * Desc:    优化的事件管理器
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.08.24
 */

const EventEmitter = require('events');

const createCB = (host, callback) => function (...args) {
	var pack = args.pop();
	if (pack.finished) return true;
	var params = args.copy();
	params.push(pack.event)
	var finished = callback.call(host, ...params);
	pack.finished = pack.finished || finished;
	return pack.finished;
};
const createEmitter = (host, eventName) => {
	var left = eventName.substring(1, eventName.length);
	var cap = eventName.substring(0, 1);
	cap = cap.toUpperCase();
	var fullEventName = 'on' + cap + left;
	host[fullEventName] = host[fullEventName] || ((...args) => host.emit(eventName, ...args));
}
const createHooker = (host, eventName) => {
	var left = eventName.substring(1, eventName.length);
	var cap = eventName.substring(0, 1);
	cap = cap.toUpperCase();
	var fullEventName = 'look' + cap + left;
	host[fullEventName] = host[fullEventName] || ((...args) => host.on(eventName, ...args));
};

class EventData {
	constructor (eventName, target) {
		this.name = eventName;
		this.data = null;
		this.timestamp = new Date();
		this.target = target;
	}
}
class EventManager {
	constructor (events) {
		this._ee = new EventEmitter();
		this._events = {};
		(events || []).map(e => {
			createHooker(this, e);
			createEmitter(this, e);
		});
		Object.defineProperty(this, '_ee', { enumerable: false });
		Object.defineProperty(this, '_events', { enumerable: false });
		Object.defineProperty(this, 'events', {
			enumerable: true,
			value: () => Object.keys(this._ee._events)
		});
	}
	get eventsx () {
		return Object.keys(this._ee._events);
	}
	on (eventName, callback) {
		var cb = createCB(this, callback);
		this._events[eventName] = this._events[eventName] || new WeakMap();
		this._events[eventName].set(callback, cb);
		this._ee.on(eventName, cb);
		createEmitter(this, eventName);
		return this;
	}
	once (eventName, callback) {
		var cb = createCB(this, callback);
		this._events[eventName] = this._events[eventName] || new WeakMap();
		this._events[eventName].set(callback, cb);
		this._ee.once(eventName, cb);
		return this;
	}
	off (eventName, callback) {
		this._events[eventName] = this._events[eventName] || new WeakMap();
		var cb = this._events[eventName].get(callback);
		this._ee.removeListener(eventName, cb);
		this._events[eventName].delete(callback);
		return this;
	}
	clear (eventName) {
		this._events[eventName] = new WeakMap();
		(this._ee._events[eventName] || []).map(cb => this._ee.removeListener(cb));
		return this;
	}
	emit (eventName, ...args) {
		var event = new EventManager.EventData(eventName, this);
		var eventPack = {
			event: event,
			finished: false
		};
		args.push(eventPack);
		this._ee.emit(eventName, ...args);
		return this;
	}
};

EventManager.EventData = EventData;

module.exports = EventManager;
global.Utils = global.Utils || {};
global.Utils.EventManager = EventManager;