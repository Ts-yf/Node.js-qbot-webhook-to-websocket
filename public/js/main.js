// 全局变量
let wsConnection = null;
let serverConfig = {
    useAuth: false,
    webhook: false,
    port: 8000
};
let stats = {
    activeConnections: 0,
    webhookCount: 0,
    messageCount: 0
};
let lastLogTime = null;

// DOM元素
const elements = {
    serverStatus: document.getElementById('server-status'),
    authMode: document.getElementById('auth-mode'),
    webhookMode: document.getElementById('webhook-mode'),
    currentPort: document.getElementById('current-port'),
    activeConnections: document.getElementById('active-connections'),
    webhookCount: document.getElementById('webhook-count'),
    messageCount: document.getElementById('message-count'),
    logs: document.getElementById('logs'),
    clearLogs: document.getElementById('clear-logs'),
    secret: document.getElementById('secret'),
    hours: document.getElementById('hours'),
    queryAuth: document.getElementById('query-auth'),
    addAuth: document.getElementById('add-auth'),
    reduceAuth: document.getElementById('reduce-auth'),
    deleteAuth: document.getElementById('delete-auth'),
    authResult: document.getElementById('auth-result'),
    authResultContent: document.getElementById('auth-result-content'),
    wsSecret: document.getElementById('ws-secret'),
    connectWs: document.getElementById('connect-ws'),
    wsStatus: document.getElementById('ws-status'),
    wsStatusText: document.getElementById('ws-status-text'),
    wsMessages: document.getElementById('ws-messages')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    fetchServerConfig();
    fetchLogs(true);
    setupEventListeners();
    
    // 每5秒更新一次服务器状态
    setInterval(fetchServerConfig, 5000);
    
    // 每2秒获取一次最新日志
    setInterval(() => fetchLogs(false), 2000);
});

// 获取服务器配置
async function fetchServerConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        serverConfig = data.config;
        stats = data.stats;
        
        updateUI();
    } catch (error) {
        addClientLog('获取服务器配置失败: ' + error.message, 'error');
        elements.serverStatus.textContent = '连接失败';
        elements.serverStatus.classList.remove('bg-green-500');
        elements.serverStatus.classList.add('bg-red-500');
    }
}

// 获取服务器日志
async function fetchLogs(isInitialFetch) {
    try {
        const url = isInitialFetch 
            ? '/api/logs?count=50' 
            : '/api/logs?count=10';
            
        const response = await fetch(url);
        const data = await response.json();
        
        if (isInitialFetch) {
            // 初始加载，清空现有日志并添加所有
            elements.logs.innerHTML = '';
            data.logs.forEach(log => {
                displayServerLog(log);
            });
            
            if (data.logs.length > 0) {
                lastLogTime = data.logs[0].time;
            }
        } else {
            // 增量更新，只添加新日志
            const newLogs = data.logs.filter(log => {
                // 简单比较时间字符串，较新的日志会字典序大于旧日志
                return !lastLogTime || log.time > lastLogTime;
            });
            
            if (newLogs.length > 0) {
                newLogs.forEach(log => {
                    displayServerLog(log);
                });
                lastLogTime = newLogs[0].time;
            }
        }
    } catch (error) {
        // 只在初始加载时显示错误
        if (isInitialFetch) {
            addClientLog('获取服务器日志失败: ' + error.message, 'error');
        }
    }
}

// 显示服务器日志
function displayServerLog(log) {
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', log.type || 'info');
    
    logEntry.textContent = `[${log.time}] ${log.message}`;
    
    // 添加到日志容器的顶部
    if (elements.logs.firstChild) {
        elements.logs.insertBefore(logEntry, elements.logs.firstChild);
    } else {
        elements.logs.appendChild(logEntry);
    }
    
    // 限制显示的日志数量
    const maxDisplayLogs = 100;
    while (elements.logs.children.length > maxDisplayLogs) {
        elements.logs.removeChild(elements.logs.lastChild);
    }
}

// 更新UI显示
function updateUI() {
    elements.authMode.textContent = serverConfig.useAuth ? '已启用' : '未启用';
    elements.webhookMode.textContent = serverConfig.webhook ? '已启用' : '未启用';
    elements.currentPort.textContent = serverConfig.port;
    
    elements.activeConnections.textContent = stats.activeConnections;
    elements.webhookCount.textContent = stats.webhookCount;
    elements.messageCount.textContent = stats.messageCount;
}

// 设置事件监听器
function setupEventListeners() {
    // 清除日志
    elements.clearLogs.addEventListener('click', () => {
        elements.logs.innerHTML = '';
    });
    
    // 授权管理
    elements.queryAuth.addEventListener('click', () => handleAuthAction(1));
    elements.addAuth.addEventListener('click', () => handleAuthAction(2));
    elements.reduceAuth.addEventListener('click', () => handleAuthAction(3));
    elements.deleteAuth.addEventListener('click', () => handleAuthAction(4));
    
    // WebSocket连接
    elements.connectWs.addEventListener('click', toggleWebSocketConnection);
}

// 处理授权操作
async function handleAuthAction(actionType) {
    const secret = elements.secret.value.trim();
    if (!secret) {
        addClientLog('请输入密钥', 'warning');
        return;
    }
    
    const hours = parseInt(elements.hours.value) || 0;
    let actionName = '';
    
    switch (actionType) {
        case 1: actionName = '查询'; break;
        case 2: actionName = '添加'; break;
        case 3: actionName = '减少'; break;
        case 4: actionName = '删除'; break;
    }
    
    try {
        addClientLog(`正在${actionName}授权: ${secret}`, 'info');
        
        const response = await fetch(`/sign?secret=${encodeURIComponent(secret)}&cz=${actionType}&hours=${hours}`);
        const result = await response.json();
        
        showAuthResult(result);
        addClientLog(`${actionName}授权完成: ${result.message}`, 'success');
    } catch (error) {
        addClientLog(`${actionName}授权失败: ${error.message}`, 'error');
    }
}

// 显示授权结果
function showAuthResult(result) {
    elements.authResult.classList.remove('hidden');
    
    let html = '';
    if (result.message) {
        html += `<p><strong>状态:</strong> ${result.message}</p>`;
    }
    if (result.auth_time) {
        html += `<p><strong>授权到期时间:</strong> ${result.auth_time}</p>`;
    }
    if (result.create_time) {
        html += `<p><strong>授权创建时间:</strong> ${result.create_time}</p>`;
    }
    
    elements.authResultContent.innerHTML = html;
    
    // 10秒后隐藏结果
    setTimeout(() => {
        elements.authResult.classList.add('hidden');
    }, 10000);
}

// 切换WebSocket连接
function toggleWebSocketConnection() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
        return;
    }
    
    const secret = elements.wsSecret.value.trim();
    if (!secret) {
        addClientLog('请输入WebSocket连接密钥', 'warning');
        return;
    }
    
    connectWebSocket(secret);
}

// 连接WebSocket
function connectWebSocket(secret) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${secret}`;
    
    addClientLog(`正在连接WebSocket: ${wsUrl}`, 'info');
    elements.wsStatusText.textContent = '正在连接...';
    elements.wsStatus.classList.remove('bg-red-500', 'bg-green-500');
    elements.wsStatus.classList.add('bg-yellow-500');
    elements.connectWs.textContent = '连接中...';
    
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = () => {
        addClientLog('WebSocket连接成功', 'success');
        elements.wsStatusText.textContent = '已连接';
        elements.wsStatus.classList.remove('bg-red-500', 'bg-yellow-500');
        elements.wsStatus.classList.add('bg-green-500');
        elements.connectWs.textContent = '断开连接';
        
        // 发送初始心跳
        sendHeartbeat();
    };
    
    wsConnection.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addWebSocketMessage(data, 'received');
            
            // 处理心跳
            if (data.op === 10) {
                const interval = data.d?.heartbeat_interval || 90000;
                setInterval(sendHeartbeat, interval);
            }
        } catch (error) {
            addClientLog('解析WebSocket消息失败: ' + error.message, 'error');
        }
    };
    
    wsConnection.onclose = () => {
        addClientLog('WebSocket连接已关闭', 'warning');
        elements.wsStatusText.textContent = '未连接';
        elements.wsStatus.classList.remove('bg-green-500', 'bg-yellow-500');
        elements.wsStatus.classList.add('bg-red-500');
        elements.connectWs.textContent = '连接';
        wsConnection = null;
    };
    
    wsConnection.onerror = (error) => {
        addClientLog('WebSocket错误: ' + error.message, 'error');
        elements.wsStatusText.textContent = '连接错误';
        elements.wsStatus.classList.remove('bg-green-500', 'bg-yellow-500');
        elements.wsStatus.classList.add('bg-red-500');
    };
}

// 发送心跳
function sendHeartbeat() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        const heartbeat = { op: 1, d: new Date().getTime() };
        wsConnection.send(JSON.stringify(heartbeat));
        addWebSocketMessage(heartbeat, 'sent');
    }
}

// 添加WebSocket消息
function addWebSocketMessage(data, type) {
    const messageEl = document.createElement('div');
    messageEl.classList.add('message', type);
    
    let content = '';
    if (typeof data === 'object') {
        if (data.op === 0 && data.t) {
            content = `<strong>${data.t}</strong>: ${JSON.stringify(data.d)}`;
        } else {
            content = `OP ${data.op}: ${JSON.stringify(data)}`;
        }
    } else {
        content = data;
    }
    
    messageEl.innerHTML = content;
    elements.wsMessages.appendChild(messageEl);
    elements.wsMessages.scrollTop = elements.wsMessages.scrollHeight;
}

// 添加客户端日志（本地浏览器生成的日志）
function addClientLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', type);
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] [客户端] ${message}`;
    
    // 添加到日志容器顶部
    if (elements.logs.firstChild) {
        elements.logs.insertBefore(logEntry, elements.logs.firstChild);
    } else {
        elements.logs.appendChild(logEntry);
    }
    
    // 限制显示的日志数量
    const maxDisplayLogs = 100;
    while (elements.logs.children.length > maxDisplayLogs) {
        elements.logs.removeChild(elements.logs.lastChild);
    }
} 