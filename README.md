[![周防有希](https://gd-hbimg.huaban.com/d9b3be4406c50c33381c466505471f6c347cf6b31e1ad2-VnKl9l)](./)

# Node.js-qbot-webhook-to-websocket

## 项目说明

- QQ机器人 WebHook to WebSocket 是一款 QQ 机器人 WebHook 到 WebSocket 的转换工具，可以将 QQ 开放平台推送的消息通过 WebSocket 协议推送到前端页面。
- 由于 QQ 官方声明，WebSocket 协议将在2024年年底不再维护，然而若将已有的机器人项目通过 WebHook 重构会耗费大量时间精力。所以为开发者提供此款工具，可以快速将 QQ 机器人 WebHook 转换为 WebSocket 协议，并通过 WebSocket 协议推送消息到机器人处理端。
- 支持一个机器人多个ws连接，支持webhook二次批量转发（配置在url.json）
- 带有简单的授权系统，可限制用户的连接数量（可开关）
- 提供美观的UI界面，方便监控和管理服务

> 项目灵感来源[qbot-webhook-to-websocket](https://github.com/DevOpen-Club/qbot-webhook-to-websocket)

## 使用文档

- 建设中...  
- 交流群： [687976465](https://qm.qq.com/q/PCWuy2zV6u)

## 使用说明

- 需要自备已备案域名
- 可使用宝塔面板pm2管理器部署（大概，还没试过）
- 手动部署安装依赖推荐使用yarn
- 自行搜索url反代https端口（443）到8000端口
- 打开main.js可有两项设置（授权开关与webhook二次转发开关）

> 授权接口，不使用授权则无法使用此接口：  
> 路径：`/sign?secret=xxx&cz=1&hours=1`  
> secret：密钥  
> cz：操作类型（1：查询，2：添加，3：减少，4：删除）  
> hours：操作相关时间（单位：小时）  

## UI界面功能

服务启动后，可以通过浏览器访问 `http://服务器IP:端口` 来使用UI界面，主要功能包括：

- 服务状态监控：显示服务运行状态、授权模式、WebHook转发状态等
- 连接统计：显示当前活跃的WebSocket连接数、WebHook接收次数等
- 授权管理：可视化管理密钥授权，包括查询、添加、减少和删除授权
- 实时日志：在界面上实时显示服务运行日志
- WebSocket连接测试：可以在界面上直接测试WebSocket连接

## 利用pm2后台运行和自启动
1. 安装全局pm2
2. `pm2 start main.js`
3. `pm2 save`

By: ZY.霆生（1109148871）