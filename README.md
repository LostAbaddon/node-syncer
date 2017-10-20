更新日志
====

----

-	多分组多目录文件同步
	-	可指定文件同步组与目录同步组
-	可通过正则表达式设置同步文件过滤规则
-	自动更新文件、创建不存在文件夹（可通过失聪模式关闭）
-	定时自动更新
-	内建命令行交互模式
	-	从外部复制文件入库
	-	添加文件/目录
	-	删除文件/目录
	-	强制立即同步
	-	查看同步历史（上次与全部历史）
	-	启动与停止巡视
	-	查看系统运行状态，并可设置定时刷新
	-	浏览监视目录组与同步状态
	-	所有指令可通过管道连续执行
-	配置文件变更后自动热更新
-	多目录自动识别是否加载

----

命令行说明
----

- 说明

采用自建的命令行交互工具——CLP（Command Line Parser）与CLI（Command Line Interface）。

CLP采用GitHub风格解析规则：主参数、主开关、子命令、子命令参数、子命令开关。
多条子命令可串联执行，每条命令后跟参数与开关，开关顺序随意，开关后可跟参数。
支持必填参数、可选参数与参数列表，参数支持过滤与默认值设置。

CLI支持简单交互，如等待输入、多选、进度条更新等。

- 外部命令

`--help|-h --config|-c <config> --showdiff|-sd --ignore|-i --deamon|-d [duration] --deaf|-df --delay|-dl <delay> --silence|-s --web|-w --socket|-skt`

参数|缩写|说明
-|-|-
--help | -h | 显示帮助
--config | -c | 配置文档地址
||`<config>` ： 配置文件地址
--showdiff | -sd | 只查看文件变更状态而不同步
--ignore | -i | 是否忽略删除
--deamon | -d | 是否启用监控模式，可配置自动监控时间间隔，默认时间为十分钟
||`[duration]` ： 可选值：数值 ； 默认值：10
--deaf | -df | 失聪模式，不监听文件与目录的改动，只定时巡查
--delay | -dl | 巡视后行动延迟时长
--silence | -s | 不启用命令行控制面板
--web | -w | 启用Web后台模式【待开发】
--socket | -skt | 启用Socket后台模式【待开发】

- 内部命令

```
help|--help|-h
refresh|re
start|st
stop|sp
list|lt --group|-g <group> --files|-f <path> --all|-a
delete|del [...files] --group|-g <group>
create|new [...files] --group|-g <group> --folder|-f
copy|cp <source> <target> --group|-g <group> --force|-f 
health|ht [duration] --interval|-i [interval] --stop|-s
history|his --all|-a
status|stt
```

GitHub 风格命令，可多条命令顺序使用。
在 CLI 模式下使用 help 指令查看具体内容。

----

v1.0.3（开发中）
----

-	巡视延迟
-	指令的异步管道
-	自热重启（开发中）
-	历史命令（开发中）
-	操作历史（开发中）
-	执行态锁定CLI（开发中）
-	连续定时同步时覆盖上一条输出（开发中）
-	完善指令系统
	-	启动巡视
	-	停止巡视
-	出错重试（开发中）
-	运行状态锁定CLI（开发中）
-	CLI模式下的Tab键补全（开发中）
-	监控模式下可自动判别文件的删除与改名（开发中）
-	Socket连接与Web连接模式（开发中）

----

v1.0.2
----

-	忽略规则增加对正则表达式的支持
-	只显示对比结果
-	新增失聪模式，不监听文件与目录的改动，只定时巡查
-	完善指令系统
	-	同步历史查看
	-	添加文件/目录
	-	从外部复制文件入库
	-	删除文件/目录
	-	变更同步历史

----

v1.0.1
----

-	多目录自动识别是否加载
-	对分组文件夹与文件进行变动监控并自动同步
-	健康状况检查支持进度条等待
-	修复命令行交互模块中进度条更新的一处bug

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