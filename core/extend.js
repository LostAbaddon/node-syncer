/**
 * Name:	Auxillary Utils and Extends
 * Desc:    常用基础类拓展
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2017.09.23
 */

// Strng Extends

String.prototype.prepadding = function (len, padding) {
	var str = this.toString();
	padding = padding || ' ';
	len = len || 0;
	var l = str.length;
	for (let i = l; i < len; i ++) str = padding + str;
	return str;
};

const KeySet = [];
(() => {
	for (let i = 0; i < 10; i ++) KeySet.push('' + i);
	for (let i = 65; i <= 90; i ++) KeySet.push(String.fromCharCode(i));
	for (let i = 97; i <= 122; i ++) KeySet.push(String.fromCharCode(i));
}) ();
String.random = (len) => {
	var rnd = "";
	for (let i = 0; i < len; i ++) {
		rnd += KeySet[Math.floor(KeySet.length * Math.random())];
	}
	return rnd;
};
String.blank = (len, block) => {
	block = block || ' ';
	var line = '';
	for (let i = 0; i < len; i ++) line += block;
	return line;
};
String.is = (str) => {
	if (str instanceof String) return true;
	if (typeof str === 'string') return true;
	return false;
};

// Object extends

Object.prototype.copy = function () {
	return Object.assign({}, this);
}
Object.prototype.extent = function (...targets) {
	var copy = Object.assign({}, this);
	targets.reverse();
	Object.assign(this, ...targets, copy);
}
Array.prototype.copy = function () {
	return this.map(ele => ele);
};
Object.defineProperty(Object.prototype, 'copy', { enumerable: false });
Object.defineProperty(Object.prototype, 'extent', { enumerable: false });
Object.defineProperty(Array.prototype, 'copy', { enumerable: false });