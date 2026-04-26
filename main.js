import { WebSocketServer as Server } from "ws";
import { createServer } from "http";
import express from 'express';
import fs from 'fs';
import axios from 'axios';
import { DateTime } from 'luxon';
import path from 'path';
import { fileURLToPath } from 'url';
const { sign } = (await import("tweetnacl")).default
const app = express();
app.use(express.json())

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 添加静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

const port = 8000;//服务端口
const useAuth = false//使用授权服务
const webhook = true//启动一对多WebHook转发服务，会把收到的消息二次转发到指定url（支持批量），适用于那些只支持原生webhook的框架（或者别的用途.?）
const ownerSecret = process.env.OWNER_SECRET || '211217'// 主人密钥（强烈建议通过环境变量 OWNER_SECRET 设置）

const authfile = `${process.cwd().replace(/\\/g, '/')}/auth.json`
const urlfile = `${process.cwd().replace(/\\/g, '/')}/url.json`
var cl = {}

// 系统日志存储
const systemLogs = [];
const MAX_LOGS = 100; // 最多保存100条日志

// 统计数据
let stats = {
    activeConnections: 0,
    webhookCount: 0,
    messageCount: 0
};

// 消息处理
async function makeWebHook(req, secret) {
  if (!secret) return req.res.send('secret参数为空')
  const data = req.body;
  if (data?.d?.hasOwnProperty("plain_token")) {
    log(`[${secret.slice(0, 3)}***]回调配置消息：${JSON.stringify(data)}`)
    return makeWebHookSign(req, secret);
  }
  // 先响应状态码，避免超时
  req.res.send({code: 0, msg: 'success'})
  
  await makeMsg(data, secret)
  if (useAuth) {
    if ((await hasAuth(secret)).isauth) {
      log(`[${secret.slice(0, 3)}***]已授权，尝试推送消息`);
      if (webhook) await sendWebHook(secret, JSON.stringify(data), req);
      await sendWebSocket(secret, JSON.stringify(data));
      stats.webhookCount++;
      return;
    } else {
      log(`[${secret.slice(0, 3)}***]未授权，忽略消息`)
      return;
    }
  }
  log(`[${secret.slice(0, 3)}***]尝试推送消息`);
  if (webhook) await sendWebHook(secret, JSON.stringify(data), req);
  await sendWebSocket(secret, JSON.stringify(data));
  stats.webhookCount++;
}

async function makeMsg(data, secret) {
  let id = data.id;
  let op = data.op;
  let d = data.d;
  let t = data.t;
  switch (op) {
    case 0:
      switch (t) {
        case 'GROUP_AT_MESSAGE_CREATE':
          return log(`[${secret.slice(0, 3)}***][群消息]：${d.content}`)
        case 'C2C_MESSAGE_CREATE':
          return log(`[${secret.slice(0, 3)}***][私聊消息]：${d.content}`)
        default:
          return log(`[${secret.slice(0, 3)}***]收到消息类型：${t}`)
      }
    default:
      return log(`[${secret.slice(0, 3)}***]收到消息：${JSON.stringify(data)}`)
  }
}
// 添加获取机器人信息的函数
async function getBotInfo(secret, appId) {
  try {
    // 首先获取 access_token
    const tokenResponse = await axios.post('https://bots.qq.com/app/getAppAccessToken', {
      appId: appId,
      clientSecret: secret
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const accessToken = tokenResponse.data.access_token;
    
    // 使用 access_token 获取机器人信息
    const botInfoResponse = await axios.get('https://api.sgroup.qq.com/users/@me', {
      headers: {
        'Authorization': `QQBot ${accessToken}`
      }
    });
    
    return botInfoResponse.data;
  } catch (error) {
    log(`[${secret.slice(0, 3)}***]获取机器人信息失败:`, error.message);
    return null;
  }
}

async function makeWebSocket(str, ws, secret) {
  let data = {}
  let op1 = JSON.stringify({ "op": 11 })
  
  try { 
    data = JSON.parse(str) 
  } catch (err) { 
    return log('解析ws消息错误', err) 
  }
  
  if (!data.hasOwnProperty('op')) { 
    await ws.send('{}'); 
    return log('解析消息错误：缺少 op 字段') 
  }
  
  if (!data.hasOwnProperty('d')) { 
    await ws.send('{}'); 
    return log('解析消息错误：缺少 d 字段') 
  }
  
  let op = data.op; 
  let d = data.d;
  
  switch (op) {
    case 1:
      log(`[${secret.slice(0, 3)}***]心跳周期：${str}`)
      return await ws.send(op1);
      
    case 2:
      log(`[${secret.slice(0, 3)}***]鉴权请求：${str}`)
      
      // 从原始请求中获取 appid
      const req = ws._socket.upgradeReq;
      const appId = req.headers["x-bot-appid"];
      
      if (appId && secret) {
        try {
          // 获取机器人信息
          const botInfo = await getBotInfo(secret, appId);
          
          if (botInfo) {
            const op2 = JSON.stringify({ 
              "op": 0, 
              "s": 1, 
              "t": "READY", 
              "d": { 
                "version": 1, 
                "session_id": "TSserver-bot-webhook-to-websocket", 
                "user": {
                  "id": botInfo.id,
                  "username": botInfo.username,
                  "bot": true
                }, 
                "shard": [0, 0] 
              } 
            });
            return await ws.send(op2);
          }
        } catch (error) {
          log(`[${secret.slice(0, 3)}***]获取机器人信息失败，使用默认信息:`, error.message);
        }
      }
      
      // 如果获取失败，使用默认信息
      const defaultOp2 = JSON.stringify({ 
        "op": 0, 
        "s": 1, 
        "t": "READY", 
        "d": { 
          "version": 1, 
          "session_id": "TSserver-bot-webhook-to-websocket", 
          "user": { 
            "id": "0",
            "username": "QQBot",
            "bot": true 
          }, 
          "shard": [0, 0] 
        } 
      });
      return await ws.send(defaultOp2);
      
    case 6:
      log(`[${secret.slice(0, 3)}***][${d.session_id}]重新连接：${d.seq}`)
      let op6 = { 
        "op": 0, 
        "s": d.seq || 1, 
        "t": "RESUMED", 
        "d": "" 
      }
      return await ws.send(JSON.stringify(op6));
      
    default:
      log(`[${secret.slice(0, 3)}***]收到消息：${str}`)
      const defaultResponse = JSON.stringify({ 
        "op": 0, 
        "s": 1, 
        "t": "READY", 
        "d": { 
          "version": 1, 
          "session_id": "TSserver-bot-webhook-to-websocket", 
          "user": { 
            "id": "0",
            "username": "QQBot",
            "bot": true 
          }, 
          "shard": [0, 0] 
        } 
      });
      return await ws.send(defaultResponse);
  }
}

async function sendWebSocket(secret, msg) {
  if ((!cl.hasOwnProperty(secret)) || (cl[secret].length == 0)) {
    log(`[${secret.slice(0, 3)}***]没有被连接`)
    return;
  }
  for (let ws of cl[secret]) {
    await ws.send(msg)
  }
  stats.messageCount++;
}

async function sendWebHook(secret, msg, req) {
  let file = {}
  try { file = JSON.parse(fs.readFileSync(urlfile, 'utf-8')) } catch (err) { log(err) }
  if ((!file.hasOwnProperty(secret)) || (file[secret].length == 0)) {
    return;
  }
  for (let url of file[secret]) {
    try {
      let { data } = await axios.post(url, req.body)
      log(`[${secret.slice(0, 3)}***]推送消息到WebHook：${url}，响应：`, data)
    } catch (err) { log(err) }
  }
}
// 消息处理END

// 功能区
function log(...data) {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  const time = `${h}:${m}:${s}:${ms}`;
  
  // 格式化日志消息
  let logMessage = '';
  for (const item of data) {
    if (typeof item === 'object') {
      try {
        logMessage += JSON.stringify(item) + ' ';
      } catch (e) {
        logMessage += '[Object] ';
      }
    } else {
      logMessage += item + ' ';
    }
  }
  
  // 存储日志
  const logEntry = {
    time,
    message: logMessage.trim(),
    type: 'info'
  };
  
  systemLogs.unshift(logEntry); // 添加到日志开头
  if (systemLogs.length > MAX_LOGS) {
    systemLogs.pop(); // 删除最旧的日志
  }
  
  console.log(`[TS-Wh-To-Ws][${time}]`, ...data);
}

function getOwnerSecretFromReq(req) {
  return (req.body?.owner_secret || req.query?.owner_secret || req.headers['x-owner-secret'] || '').toString();
}

function isOwnerSecretConfigured() {
  return !!ownerSecret && ownerSecret !== 'please_change_owner_secret';
}

function isOwnerAuthorized(req) {
  const inputOwnerSecret = getOwnerSecretFromReq(req);
  return isOwnerSecretConfigured() && inputOwnerSecret === ownerSecret;
}

function requireOwner(req, res) {
  if (!isOwnerSecretConfigured()) {
    res.status(403).send({
      message: '主人密钥未配置，相关操作已禁用'
    });
    return false;
  }

  if (!isOwnerAuthorized(req)) {
    res.status(403).send({
      message: '无权限：仅主人可执行此操作'
    });
    return false;
  }
  return true;
}

function hasAuth(secret) {
  let file = {}
  let result = { isauth: false, auth_time: '', create_time: '', message: 'TS-QQbot-Wh-to-Ws' }
  try { file = JSON.parse(fs.readFileSync(authfile, 'utf-8')) } catch (err) { log(err) }
  let now = DateTime.now()
  if (!file.hasOwnProperty(secret)) {
    result.isauth = false
    result.message = '未查询到授权信息'
  } else {
    let isauth = now < DateTime.fromISO(file[secret]?.auth_time)
    if (isauth) {
      result.isauth = isauth
      result.auth_time = DateTime.fromISO(file[secret].auth_time).toFormat('yyyy-MM-dd HH:mm:ss')
      result.create_time = DateTime.fromISO(file[secret].create_time).toFormat('yyyy-MM-dd HH:mm:ss')
      result.message = '已授权'
    } else {
      result.auth_time = DateTime.fromISO(file[secret].auth_time).toFormat('yyyy-MM-dd HH:mm:ss')
      result.create_time = DateTime.fromISO(file[secret].create_time).toFormat('yyyy-MM-dd HH:mm:ss')
      result.isauth = isauth
      result.message = '授权过期'
    }
  }
  return result;
}

async function makeWebHookSign(req, secret) {
  const { plain_token, event_ts } = req.body.d
  while (secret.length < 32)
    secret = secret.repeat(2).slice(0, 32)
  const signature = Buffer.from(sign.detached(
    Buffer.from(`${event_ts}${plain_token}`),
    sign.keyPair.fromSeed(Buffer.from(secret)).secretKey,
  )).toString("hex")
  log(`[${secret.slice(0, 3)}***]计算签名：${signature}`)
  req.res.send({ plain_token, signature })
}
// 功能区END

// API接口
app.get('/api/config', (req, res) => {
  // 获取当前连接数
  let totalConnections = 0;
  Object.keys(cl).forEach(key => {
    totalConnections += cl[key].length;
  });
  stats.activeConnections = totalConnections;

  return res.json({
    config: {
      useAuth,
      webhook,
      port,
      ownerControlEnabled: true,
      ownerSecretConfigured: isOwnerSecretConfigured()
    },
    stats
  });
});

// 获取系统日志
app.get('/api/logs', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  return res.json({
    logs: systemLogs.slice(0, Math.min(count, systemLogs.length))
  });
});

// 查询某个secret的Webhook转发目标
app.get('/api/webhook/targets', (req, res) => {
  const secret = (req.query?.secret || '').toString().trim();
  if (!secret) {
    return res.status(400).json({ message: 'secret不能为空' });
  }

  let file = {};
  try { file = JSON.parse(fs.readFileSync(urlfile, 'utf-8')) } catch (err) { log(err) }

  return res.json({
    secret,
    webhook,
    urls: Array.isArray(file[secret]) ? file[secret] : []
  });
});

// 修改某个secret的Webhook转发目标（仅主人）
app.post('/api/webhook/targets', (req, res) => {
  if (!requireOwner(req, res)) return;

  const secret = (req.body?.secret || '').toString().trim();
  const urls = req.body?.urls;

  if (!secret) {
    return res.status(400).json({ message: 'secret不能为空' });
  }
  if (!Array.isArray(urls)) {
    return res.status(400).json({ message: 'urls必须是数组' });
  }

  const normalizedUrls = urls
    .map(item => (item || '').toString().trim())
    .filter(Boolean);

  const invalidUrl = normalizedUrls.find(url => !/^https?:\/\//i.test(url));
  if (invalidUrl) {
    return res.status(400).json({ message: `非法URL：${invalidUrl}` });
  }

  let file = {};
  try { file = JSON.parse(fs.readFileSync(urlfile, 'utf-8')) } catch (err) { log(err) }

  if (normalizedUrls.length === 0) {
    delete file[secret];
  } else {
    file[secret] = normalizedUrls;
  }

  fs.writeFileSync(urlfile, JSON.stringify(file, null, 2));

  return res.json({
    message: normalizedUrls.length === 0 ? '已清空该secret的Webhook转发目标' : 'Webhook转发目标已保存',
    secret,
    urls: normalizedUrls
  });
});

// Webhook二次转发总开关（仅主人）
app.post('/api/webhook/toggle', (req, res) => {
  if (!requireOwner(req, res)) return;

  webhook = !!req.body?.enabled;
  log(`Webhook二次转发已${webhook ? '开启' : '关闭'}`);

  return res.json({
    message: `Webhook二次转发已${webhook ? '开启' : '关闭'}`,
    webhook
  });
});

// 主页
app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/webhook', async (req, res) => {
  return await makeWebHook(req, req.query?.secret);
});

if (useAuth) {
  app.get('/sign', async (req, res) => {
    let secret = req.query?.secret || '';
    let cz = Number(req.query?.cz) || 1;
    let hours = Number(req.query?.hours) || 0;
    
    if (!isOwnerSecretConfigured()) {
      return res.status(403).send({
        message: '主人密钥未配置，授权接口已禁用'
      });
    }

    let file = {}
    let result = { auth_time: '', create_time: '' }
    try { file = JSON.parse(fs.readFileSync(authfile, 'utf-8')) } catch (err) { log(err) }
    let now = DateTime.now()
    
    if ([2, 3, 4].includes(cz)) {
      if (!requireOwner(req, res)) return;
    }

    if (cz == 1) {// 查询授权
      result = await hasAuth(secret)
    } else if (cz == 2) {// 添加授权
      if (file.hasOwnProperty(secret)) {
        file[secret].auth_time = ((DateTime.fromISO(file[secret]?.auth_time)).plus({ hours })).toFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSS')
        fs.writeFileSync(authfile, JSON.stringify(file))
        result.auth_time = DateTime.fromISO(file[secret].auth_time).toFormat('yyyy-MM-dd HH:mm:ss')
        result.create_time = DateTime.fromISO(file[secret].create_time).toFormat('yyyy-MM-dd HH:mm:ss')
        result.message = `已添加${hours}小时授权`
      } else {
        file[secret] = {
          auth_time: (now.plus({ hours })).toFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSS'),
          create_time: now.toFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSS')
        }
        fs.writeFileSync(authfile, JSON.stringify(file))
        result.auth_time = DateTime.fromISO(file[secret].auth_time).toFormat('yyyy-MM-dd HH:mm:ss')
        result.create_time = DateTime.fromISO(file[secret].create_time).toFormat('yyyy-MM-dd HH:mm:ss')
        result.message = `已添加${hours}小时授权`
      }
    } else if (cz == 3) {// 减少授权
      if (file.hasOwnProperty(secret)) {
        let auth_time = (DateTime.fromISO(file[secret]?.auth_time)).minus({ hours })
        if (auth_time < 0) {
          delete file[secret];
          fs.writeFileSync(authfile, JSON.stringify(file))
          result.message = `已删除授权`
        } else {
          file[secret].auth_time = auth_time.toFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSS')
          fs.writeFileSync(authfile, JSON.stringify(file))
          result.auth_time = DateTime.fromISO(file[secret].auth_time).toFormat('yyyy-MM-dd HH:mm:ss')
          result.create_time = DateTime.fromISO(file[secret].create_time).toFormat('yyyy-MM-dd HH:mm:ss')
          result.message = `已减少${hours}小时授权`
        }
      } else {
        result.message = `未查询到授权`
      }
    } else if (cz == 4) {// 删除授权
      if (file.hasOwnProperty(secret)) {
        delete file[secret];
        fs.writeFileSync(authfile, JSON.stringify(file))
        result.message = `已删除授权`
      } else {
        result.message = `未查询到授权`
      }
    } else {
      result.message = 'Serve is running'
    }
    res.send(result)
  });
}
const server = createServer(app);

const chatWS = new Server({ noServer: true }); //这里采用noServer
chatWS.on("connection", (conn, req, secret) => {
  if (!cl.hasOwnProperty(secret)) cl[secret] = [];
  cl[secret].push(conn);
  
  // 存储原始请求对象，以便后续获取 headers
  conn._socket.upgradeReq = req;
  
  conn.send(JSON.stringify({"op": 10,"d": {"heartbeat_interval": 90000}}));
  log(`[${secret.slice(0, 3)}***]已连接[${cl[secret].length}]个实例`);
  
  conn.on("message", async (str) => {
    return await makeWebSocket(str, conn, secret);
  });
  
  conn.on('close', () => {
    if (cl.hasOwnProperty(secret)) cl[secret] = cl[secret].filter(client => client !== conn);
    log(`[${secret.slice(0, 3)}***]断开连接`);
  });
});

server.on("upgrade", (req, socket, head) => {
  if ((new RegExp('/ws/(.*)')).test(req.url)) {
    //由chatWS 进行处理
    let secret = (req.url.match(/\/ws\/(.*)/))[1];
    if (secret == '') {
      return socket.destroy();//空密钥拒绝连接
    }
    chatWS.handleUpgrade(req, socket, head, (conn) => {
      chatWS.emit("connection", conn, req, secret);
    });
  } else {
    //直接关闭连接
    socket.destroy();
  }
});

server.listen(port, '0.0.0.0', () => {
  log(`${useAuth ? '使用' : '不使用'}授权服务`);
  log(`服务器已开启，端口号：${port}`);
  log(`UI界面访问地址: http://localhost:${port}`);
});
