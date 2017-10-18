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
	pack.finished = finished;
	return pack.finished;
};
const createEmitter = (host, eventName) => {
	var left = eventName.substring(1, eventName.length);
	var cap = eventName.substring(0, 1);
	cap = cap.toUpperCase();
	var fullEventName = 'on' + cap + left;
	host[fullEventName] = host[fullEventName] || ((...args) => host.emit(eventName, ...args));
	if (host.host) host.host[fullEventName] = host.host[fullEventName] || ((...args) => {
		host.emit(eventName, ...args);
		return host.host;
	});
};
const createHooker = (host, eventName) => {
	var left = eventName.substring(1, eventName.length);
	var cap = eventName.substring(0, 1);
	cap = cap.toUpperCase();
	var fullEventName = 'look' + cap + left;
	host[fullEventName] = host[fullEventName] || ((...args) => host.on(eventName, ...args));
	if (!!host.host) host.host[fullEventName] = host.host[fullEventName] || ((...args) => {
		host.on(eventName, ...args);
		return host.host;
	});
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
	constructor (host, events) {
		if (!events && host instanceof Array) {
			events = host;
			host = null;
		}
		var self = this;
		var _ee = new EventEmitter();
		var _events = {};
		Object.defineProperty(this, '_ee', { configurable: false, value: _ee });
		Object.defineProperty(this, '_events', { configurable: false, value: _events });

		if (!!host) {
			Object.defineProperty(this, 'host', { configurable: false, value: host });
			if (!host.heart) Object.defineProperty(host, 'heart', { configurable: false, value: self });
			host.on = host.on || function (...args) { self.on.apply(self, args); return host; };
			host.once = host.once || function (...args) { self.once.apply(self, args); return host; };
			host.off = host.off || function (...args) { self.off.apply(self, args); return host; };
			host.clear = host.clear || function (...args) { self.clear.apply(self, args); return host; };
			host.emit = host.emit || function (...args) { self.emit.apply(self, args); return host; };
			if (!host.events) Object.defineProperty(host, 'events', { value: self.events });
		}

		(events || []).map(e => {
			createHooker(this, e);
			createEmitter(this, e);
		});
	}
	get events () {
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
		var list = (this._ee._events[eventName] || []).copy();
		list.map(cb => {
			this._ee.removeListener(eventName, cb);
		});
		return this;
	}
	emit (eventName, ...args) {
		var event = new EventManager.EventData(eventName, this.host || this);
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