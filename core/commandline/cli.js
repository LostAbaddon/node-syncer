/**
 * Name:	Commander Line Interface
 * Desc:    命令行交互
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.14
 */

const RegRawStyle = /[\u001b].*?m/g;

const ReadLine = require('readline');

const setStyle = require('../setConsoleStyle');
const DefaultHistorySize = 30;
const DefaultHints = {
	hint: '> ',
	answer: '_ ',
	error: ': ',
	errorStyle: 'magenta',
	optionStyle: 'green bold',
	probarTitleStyle: 'yellow bold',
	probarBGStyle: 'bgCyan',
	probarFGStyle: 'bgGreen',
	welcome: 'Welcome!',
	byebye: 'Byebye...'
};

class CLI {
	constructor (historySize, hints) {
		this.historySize = historySize || DefaultHistorySize;
		if (isNaN(this.historySize) || this.historySize < 0) this.historySize = DefaultHistorySize;

		this.requestCallback = null;
		this.quitCallback = null;
		this.exitCallback = null;

		hints = hints || {};
		this.hints = {};
		this.hints.hint = hints.hint || DefaultHints.hint;
		this.hints.answer = hints.answer || DefaultHints.answer;
		this.hints.error = hints.error || DefaultHints.error;
		this.hints.errorStyle = hints.errorStyle || DefaultHints.errorStyle;
		this.hints.optionStyle = hints.optionStyle || DefaultHints.optionStyle;
		this.hints.probarTitleStyle = hints.probarTitleStyle || DefaultHints.probarTitleStyle;
		this.hints.probarBGStyle = hints.probarBGStyle || DefaultHints.probarBGStyle;
		this.hints.probarFGStyle = hints.probarFGStyle || DefaultHints.probarFGStyle;
		this.hints.welcome = hints.welcome || DefaultHints.welcome;
		this.hints.byebye = hints.byebye || DefaultHints.byebye;

		this.waiting = false;
		this.shouldStopWaiting = false;
		this.waitingKey = null;
		this.waitingPrompt = '';
		this.waitingPool = [];
		this.waitingOptions = [];
		this.processLength = 0;
		this.processPercent = [];
		this.waitingInput = false;

		ReadLine.emitKeypressEvents(process.stdin);
		process.stdin.setEncoding('utf8');
		process.stdin.setRawMode(true);
		process.stdin.on('keypress', (chunk, key) => {
			if (key && key.ctrl && key.name == 'c') {
				this.waiting = false;
				this.close();
				setImmediate(() => {
					if (this.exitCallback) this.exitCallback();
				});
			}
			if (!this.waiting) return;
			if (key.name !== 'return') this.waitingInput = true;
			var optionIndex = this.waitingOptions.indexOf(key.name);
			if (key.name !== this.waitingKey && optionIndex < 0) {
				this.clear();
				this.cursor(-9999, 0);
				let last_inputted = this.waitingInput;
				setImmediate(() => {
					this.clear();
					this.cursor(-9999, 0);
					if (!this.waiting) return;
					if (this.waitingKey !== 'return' && key.name === 'return') {
						if (last_inputted) {
							this.cursor(-9999, -1);
							console.log(this.waitingPrompt);
							this.cursor(-9999, -1);
							rl.history.shift();
							this.waitingInput = false;
						}
						else {
							console.log(this.waitingPrompt);
							this.cursor(-9999, -1);
						}
					}
					else {
						console.log(this.waitingPrompt);
						this.cursor(-9999, -1);
					}
				});
				return;
			}
			if (this.waitingKey === 'return') {
				this.shouldStopWaiting = true;
				this.answer(this.waitingPrompt);
				this.hint();
				let last_inputted = this.waitingInput;
				if (key.name === 'return') setImmediate(() => {
					if (last_inputted) rl.history.shift();
				});
			}
			else {
				if (key.name === this.waitingKey || optionIndex >= 0) {
					setImmediate(() => {
						this.cursor(-9999, 0);
						this.clear();
						console.log(setStyle(this.waitingPrompt.replace(RegRawStyle, ''), 'yellow bold'));
						this.waiting = false;
						this.shouldStopWaiting = false;
						this.hint();
						this.clear(1);
						var reses = this.waitingPool.map(pair => pair[0]);
						this.waitingPool.splice(0, this.waitingPool.length);
						if (this.waitingOptions.length < 0) optionIndex = '';
						reses.map(res => res(optionIndex));
					});
				}
				else {
					this.shouldStopWaiting = true;
					this.answer(this.waitingPrompt);
					this.hint();
				}
			}
		});

		var rl = ReadLine.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true,
			historySize: this.historySize,
			removeHistoryDuplicates: true
		});
		this.rl = rl;

		rl.on('line', line => {
			if (this.shouldStopWaiting && this.waiting) {
				this.waitingInput = false;
				this.waiting = false;
				this.shouldStopWaiting = false;
				setImmediate(() => {
					this.cursor(-9999, 0);
					this.clear();
					this.cursor(0, -1);
					this.clear();
					this.cursor(0, -1);
					this.clear();
					console.log(setStyle(this.waitingPrompt.replace(RegRawStyle, ''), 'yellow bold'));
					this.hint();
					var reses = this.waitingPool.map(pair => pair[0]);
					this.waitingPool.splice(0, this.waitingPool.length);
					reses.map(res => res());
				});
				return;
			}
			line = line.trim();
			if (line.length > 0) {
				let result;
				if (!!this.requestCallback) {
					result = this.requestCallback(line, this);
					if (!!result && result.msg.length > 0 && !result.nohint) this.answer(result.msg);
				}
				if (!result || !result.nohint) this.hint();
			}
			else {
				this.clear();
				this.cursor(-9999, -1);
				var prompt = rl._prompt.replace(RegRawStyle, '');
				this.cursor(prompt.length, 0);
			}
		});

		this.hint();
		this.answer(this.hints.welcome);
	}
	hint (hint) {
		hint = hint || this.hints.hint;
		this.rl.setPrompt(hint);
		this.rl.prompt();
		return this;
	}
	nohint () {
		this.rl.setPrompt('');
		this.rl.prompt();
		return this;
	}
	answer (text) {
		text = text || '';
		this.hint(this.hints.answer);
		console.log(text);
		this.hint();
		return this;
	}
	error (text) {
		text = text || '';
		this.hint(this.hints.error);
		console.log(setStyle(text, this.hints.errorStyle));
		this.hint();
		return this;
	}
	clear (dir) {
		ReadLine.clearLine(process.stdin, dir || 0);
		return this;
	}
	cursor (dx, dy) {
		ReadLine.moveCursor(process.stdin, dx, dy);
		return this;
	}
	waitEnter (prompt, key) {
		return new Promise((res, rej) => {
			this.waiting = true;
			this.shouldStopWaiting = false;
			this.waitingKey = key || 'return';
			this.waitingOptions = [];
			this.waitingPrompt = this.hints.answer + (prompt || (this.waitingKey === 'return' ? '请按回车键......' : '请按' + this.waitingKey + '键......'));
			this.waitingPool.push([res, rej]);
			this.clear();
			this.cursor(-9999, 0);
			console.log(this.waitingPrompt);
			this.cursor(-9999, -1);
		});
	}
	waitOption (message, options) {
		return new Promise((res, rej) => {
			this.answer(message);
			this.waiting = true;
			this.shouldStopWaiting = false;
			this.waitingKey = 'nothing';
			this.waitingOptions = options.map((opt, i) => {
				var key;
				if (i < 9) key = (i + 1) + '';
				else key = String.fromCharCode(56 + i);
				this.answer('  ' + setStyle(key, this.hints.optionStyle) + String.blank(4 - key.length) + '-   ' + opt);
				return key.toLowerCase();
			});
			this.waitingPrompt = this.hints.answer + '请选择：';
			this.waitingPool.push([res, rej]);
			this.clear();
			this.cursor(-9999, 0);
			console.log(this.waitingPrompt);
			this.cursor(-9999, -1);
		});
	}
	waitProcessbar (hint, length, total) {
		return new Promise((res, rej) => {
			this.answer(setStyle(hint, this.hints.probarTitleStyle));
			this.answer(String.blank(length, '-'));
			this.processLength = length;
			for (let i = 0; i < total; i ++) {
				let j = (i + 1) + '';
				this.answer(String.blank(4 - j.length) + j + ' ' + setStyle(String.blank(length - 5), this.hints.probarBGStyle));
				this.processPercent[i] = 0;
			}
			this.answer(String.blank(length, '-'));
			this.waiting = true;
			this.shouldStopWaiting = false;
			this.waitingKey = 'nothing';
			this.waitingOptions = [];
			this.waitingPrompt = this.hints.answer + '更新中……';
			this.waitingPool.push([res, rej]);
			this.clear();
			this.cursor(-9999, 0);
			console.log(this.waitingPrompt);
			this.cursor(-9999, -1);
		});
	}
	updateProcessbar (index, percent) {
		var total = this.processPercent.length;
		if (index < 0 || index >= total) return;
		if (percent < 0) return;
		if (percent > 1) percent = 1;
		this.processPercent[index] = percent;
		var delta = total - index + 1;
		this.cursor(-9990, -delta);
		var j = (index + 1) + '';
		var p = Math.round((this.processLength - 5) * percent);
		var q = this.processLength - 5 - p;
		console.log(this.hints.answer + String.blank(4 - j.length) + j + ' ' + setStyle(String.blank(p), this.hints.probarFGStyle) + setStyle(String.blank(q), this.hints.probarBGStyle));
		this.cursor(-9990, delta - 1);
		var done = !this.processPercent.some(p => p < 1);
		if (done) {
			this.shouldStopWaiting = false;
			this.waiting = false;
			this.waitingInput = false;
			setImmediate(() => {
				this.cursor(-9999, 0);
				this.clear();
				this.answer(setStyle('进度已完成！', 'yellow bold'));
				this.waiting = false;
				this.shouldStopWaiting = false;
				this.waitingInput = false;
				this.hint();
				this.clear(1);
				var reses = this.waitingPool.map(pair => pair[0]);
				this.waitingPool.splice(0, this.waitingPool.length);
				reses.map(res => res(''));
			});
		}
	}
	close (silence) {
		if (!!this.quitCallback) this.quitCallback(this);
		if (!silence) this.answer(this.hints.byebye);
		setImmediate(() => {
			this.clear();
			this.cursor(-9999, 0);
			this.rl.close();
			process.stdin.destroy();
		});
	}
	onRequest (callback) {
		this.requestCallback = callback;
		return this;
	}
	onQuit (callback) {
		this.quitCallback = callback;
		return this;
	}
	onExit (callback) {
		this.exitCallback = callback;
		return this;
	}
}

const Intereface = config => {
	config = config || {};
	var cli = new CLI(config.historySize, config.hints);
	return cli;
};
Intereface.CLI = CLI;

global.Utils = global.Utils || {};
global.Utils.CLI = Intereface;

module.exports = Intereface;