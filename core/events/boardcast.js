/**
 * Name:	Boardcast
 * Desc:    广播
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.11.17
 */

const EM = require('./eventManager');

class BoardcastEvent extends EM.EventData {
	constructor (publisher, channel, message) {
		super('Boardcast', publisher);
		this.channel = channel;
		this.current = channel;
		this.data = message;
		this.bubbleUp = true;
	}
}
class ChannelNode {
	constructor (path) {
		this.path = path;
		this.parent = null;
		this.children = [];
	}
	static getPathList (path) {
		path = path.replace(/[\n\t\r\\]+/gi, '/').split('/');
		return path.map(p => p.replace(/(^[ 　]+|[ 　]+$)/gi, '')).filter(p => p.length > 0);
	}
	static addNode (root, path) {
		path = ChannelNode.getPathList(path);
		var fullpath = '', parent = null;
		path.forEach(p => {
			fullpath += '/' + p;
			var n = root.channels[fullpath];
			if (!n) {
				n = new ChannelNode(fullpath);
				root.channels[fullpath] = n;
			}
			if (!!parent) {
				n.parent = parent;
				if (parent.children.indexOf(n) < 0) parent.children.push(n);
			}
			parent = n;
		});
		return parent;
	}
}

class Boardcast {
	constructor () {
		var em = new EM(null, null, BoardcastEvent, true);
		Object.defineProperty(this, 'em', {
			configurable: false,
			enumerable: false,
			get: () => em
		});
		var channels = {};
		Object.defineProperty(this, 'channels', {
			configurable: false,
			enumerable: false,
			get: () => channels
		});
		Object.defineProperty(this, 'channelList', {
			configurable: false,
			enumerable: true,
			get: () => Object.keys(channels)
		});
	}
	subscribe (channel, callback) {
		channel = ChannelNode.addNode(this, channel);
		this.em.on(channel.path, callback);
	}
	unsubscribe (channel, callback) {
		channel = ChannelNode.addNode(this, channel);
		this.em.off(channel.path, callback);
	}
	publish (channel, message, publisher) {
		channel = ChannelNode.addNode(this, channel);
		var event = new BoardcastEvent(publisher || this, channel.path, message);
		while (!!channel) {
			event.current = channel.path;
			this.em.emit(channel.path, event);
			if (!event.bubbleUp) break;
			channel = channel.parent;
		}
	}
}
Boardcast.Event = BoardcastEvent;

module.exports = Boardcast;
global.Utils = global.Utils || {};
global.Utils.Boardcast = Boardcast;