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

v1.0.1（开发中）
----

-	多目录自动识别是否加载
-	监控模式下可自动判别文件的删除与改名
-	Socket连接与Web连接模式

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