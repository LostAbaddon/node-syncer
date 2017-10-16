// One Thread, One Task

var CurrentQuest = null;
var CurrentPath = '';

// For Task Done
this.finish = msg => {
	if (CurrentQuest === null) return;
	postMessage({
		quest: CurrentQuest,
		action: 'complete',
		data: msg
	});
	CurrentQuest = null;
};
// For Message
this.post = msg => {
	if (CurrentQuest === null) return;
	postMessage({
		quest: CurrentQuest,
		action: 'message',
		msg: msg
	});
};
// For Errors
this.report = (type, msg, data) => {
	__postError({
		type: type,
		msg: msg.replace(/(^\n*|\n*$)/gi, ''),
		data: data
	});
};

/*
task class structure:
{
	quest: String,
	worker: Async Function, return null for async.
	onmessage: Function: msg => {}
}
 */
((global) => {
	var tasks = {}; // For thread-tasks, key-task pair	

	global.register = task => {
		tasks[task.quest] = task;
	};
	global.invoke = async (quest, opt) => {
		var q = tasks[quest];
		if (!q) {
			report('no_such_quest', "No Such Quest: " + quest, { type: 'invoke', quest: quest });
			return;
		}
		var result = await q.worker(opt);
		if (!result) return;
		finish(result);
	};
	global.transfer = (quest, opt) => {
		var q = tasks[quest];
		if (!q) {
			report('no_such_quest', "No Such Quest: " + quest, { type: 'message', quest: quest });
			return;
		}
		if (!q) return;
		q.onmessage(opt);
	};
}) (this);

var attachScript = path => {
	if (!path) return;
	if (path.substr(0, 1) === '.') {
		path = CurrentPath + '/' + path;
	}
	try {
		importScripts(path);
	}
	catch (err) {
		console.error('Import Script Error:', path);
		report('import_script_error', err.message, path);
	}
};
var init = (filelist, loglev) => {
	importScripts(CurrentPath + '/extend.js');
	importScripts(CurrentPath + '/datetime.js');
	importScripts(CurrentPath + '/threads/threadLogger.js');
	importScripts(CurrentPath + '/threads/threadTimer.js');

	setLogLev(loglev);

	filelist.map(path => {
		attachScript(path);
	});
};

// Communicate with Process
this.onmessage = (data) => {
	data = data.data;
	if (data.action === 'init') {
		CurrentPath = data.path;
		init(data.filelist, data.loglev);
	}
	else if (data.action === 'attach') {
		attachScript(data.script);
	}
	else if (data.action === 'quest') {
		CurrentQuest = data.quest;
		invoke(data.quest, data.data);
	}
	else if (data.action === 'message') {
		transfer(CurrentQuest, data.data);
	}
};