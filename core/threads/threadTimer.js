((self, thread) => {
	self.AllTimerTag = Symbol('AllTimerTag');
	const timerPool = [];
	const getStamp = () => new Date().getTime();
	const invokeTask = () => {
		var pending = [], now = getStamp();
		for (var i = 0, l = timerPool.length; i < l; i ++) {
			let task = timerPool[i];
			if (task.expire <= now) {
				pending.push(task);
				if (!task.keep) {
					timerPool.splice(i, 1);
					l --;
					i --;
				}
			}
			else break;
		}
		if (timerPool.length > 0) thread.nextTick(invokeTask);
		pending.map(task => {
			var t = 0;
			if (task.tag === 2 && task.delay !== 2) {
				t = task.delay === 0 ? now : getStamp();
			}
			task.func();
			if (task.tag === 2 && task.delay == 2) {
				t = getStamp();
			}
			if (task.tag === 2) {
				task.expire = t + task.duration;
			}
		});
	};
	const dispatchTask = (task) => {
		var shouldStart = (timerPool.length === 0);
		timerPool.push(task);
		timerPool.sort((ta, tb) => ta.expire - tb.expire);
		if (shouldStart) thread.nextTick(invokeTask);
	};
	const removeTask = (tag, func) => {
		var index = -1;
		timerPool.some((task, i) => {
			if (task.tag === tag && task.func === func) {
				index = i;
				return true;
			}
		});
		if (index < 0) return;
		timerPool.splice(index, 1);
	};
	const removeAllTask = (tag) => {
		var l = timerPool.length, i;
		for (i = l - 1; i >= 0; i --) {
			let task = timerPool[i];
			if (task.tag === tag) {
				timerPool.splice(i, 1);
			}
		}
	};
	self.setImmediate = cb => {
		var data = {
			tag: 0,
			func: cb,
			expire: getStamp(),
			duration: 0,
			keep: false,
			delay: 0
		};
		dispatchTask(data);
	};
	self.clearImmediate = cb => {
		if (cb === AllTimerTag) removeAllTask(0);
		else removeTask(0, cb);
	};
	self.setTimeout = (cb, delay) => {
		delay = (delay * 1) || 0;
		var data = {
			tag: 1,
			func: cb,
			expire: getStamp() + delay,
			duration: delay,
			keep: false,
			delay: 0
		};
		dispatchTask(data);
	};
	self.clearTimeout = cb => {
		if (cb === AllTimerTag) removeAllTask(1);
		else removeTask(1, cb);
	};
	self.setInterval = (cb, delay, delayMode) => {
		delay = (delay * 1) || 0;
		var data = {
			tag: 2,
			func: cb,
			expire: getStamp() + delay,
			duration: delay,
			keep: true,
			delay: delayMode || 0
		};
		dispatchTask(data);
	};
	self.clearInterval = cb => {
		if (cb === AllTimerTag) removeAllTask(2);
		else removeTask(2, cb);
	};
}) (this, thread);