更新日志
====

----

-	多组目录同步
-	多目录自动识别是否加载
-	自动更新文件、创建不存在文件夹
-	文件变动监控
-	监控模式下可自动判别文件的删除与改名
-	自定义过滤条件

----

命令行说明
----

- 外部命令

`--help|-h --config|-c <config> --ignore|-i --deamon|-d [duration] --silence|-s --web|-w`

参数|缩写|说明
-|-|-
--help | -h | 显示帮助
--config | -c | 配置文档地址
||<config> ： 配置文件地址
--ignore | -i | 是否忽略删除
--deamon | -d | 是否启用监控模式，可配置自动监控时间间隔，默认时间为十分钟
||[duration] ： 可选值：数值 ； 默认值：10
--silence | -s | 不启用命令行控制面板
--web | -w | 启用Web后台模式【待开发】

- 内部命令

```
refresh|re
start|st
stop|sp
list|lt --group|-g <group> --files|-f <path> --all|-a
delete|del [...files] --group|-g <group>
create|new [...files] --group|-g <group> --folder|-f
copy|cp <source> <target> --group|-g <group>
health|ht [duration] --interval|-i [interval] --stop|-s
history|his --all|-a
status|stt
```

GitHub 风格命令，可多条命令顺序使用。
在 CLI 模式下使用 help 指令查看具体内容。

----

v1.0.1（开发中）
----

-	多目录自动识别是否加载
-	完善指令系统（开发中）
-	监控模式下可自动判别文件的删除与改名（开发中）
-	Socket连接与Web连接模式（开发中）

----

v1.0.0
----

-	多组目录同步
-	自动更新文件、创建不存在文件夹
-	文件变动监控
-	自定义过滤条件
-	命令行交互模式（命令行解析与命令行交互）

```json
{
	"configVersion": "0.1.0",
	"ignore": [
		".*",
		"~*",
		"Dropbox",
		"node_modules",
		"package-lock.json"
	],
	"group": {
		"folder1": [
			"~/Documents/Pages",
			"~/Library/Mobile Documents/com~apple~CloudDocs/Documents/Pages",
			"~/Dropbox/Pages"
		],
		"folder2": [
			"~/Documents/Codes/Syncer",
			"~/tmp/test"
		],
		"file": [
			"~/Documents/aaa/file1.js",
			"~/Documents/bbb/file2.js",
			"~/Documents/ccc/file3.js"
		]
	},
	"monitor": 600,
	"deamonMode": false
}
```

----

v0.0.1
----

-	自动更新文件、创建不存在文件夹
-	主目录文件变动监控
-	自定义过滤条件
-	配置示例：

```json
{
	"path": [
		"~/Documents/Dropbox",
		"~/Dropbox",
		"~/Documents"
	],
	"ignore": [
		".*",
		"~*",
		"Dropbox",
		"Icon\r",
		"Icon?",
		"node_modules",
		"package-lock.json"
	],
	"monitor": 600
}
```

----

License
----
MIT