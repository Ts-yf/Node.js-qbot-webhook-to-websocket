// 全局变量
let wsConnection = null;
let serverConfig = {
    useAuth: false,
    webhook: false,
    port: 8000,
    ownerSecretConfigured: false
};
let stats = {
    activeConnections: 0,
    webhookCount: 0,
    messageCount: 0
};
let lastLogTime = null;
let webhookToggleBusy = false;

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
    ownerSecret: document.getElementById('owner-secret'),
    ownerTip: document.getElementById('owner-tip'),
    queryAuth: document.getElementById('query-auth'),
    addAuth: document.getElementById('add-auth'),
    reduceAuth: document.getElementById('reduce-auth'),
    deleteAuth: document.getElementById('delete-auth'),
    authResult: document.getElementById('auth-result'),
    authResultContent: document.getElementById('auth-result-content'),
    webhookSecret: document.getElementById('webhook-secret'),
    webhookUrls: document.getElementById('webhook-urls'),
    loadWebhookTargets: document.getElementById('load-webhook-targets'),
    saveWebhookTargets: document.getElementById('save-webhook-targets'),
    toggleWebhook: document.getElementById('toggle-webhook'),
    webhookResult: document.getElementById('webhook-result'),
    webhookResultContent: document.getElementById('webhook-result-content'),
    wsSecret: document.getElementById('ws-secret'),
    connectWs: document.getElementById('connect-ws'),
    wsStatus: document.getElementById('ws-status'),
    wsStatusText: document.getElementById('ws-status-text'),
    wsMessages: document.getElementById('ws-messages'),
    themeToggle: document.getElementById('theme-toggle'),
    themeSystem: document.getElementById('theme-system')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initThemeMode();
    fetchServerConfig();
    fetchLogs(true);
    setupEventListeners();
    updateOwnerControls();
    
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

    updateWebhookToggleButton();
    updateOwnerControls();
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
    
    elements.ownerSecret.addEventListener('input', updateOwnerControls);

    // WebHook转发配置
    elements.loadWebhookTargets.addEventListener('click', loadWebhookTargets);
    elements.saveWebhookTargets.addEventListener('click', saveWebhookTargets);
    elements.toggleWebhook.addEventListener('click', toggleWebhookSwitch);

    // 主题模式
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleThemeMode);
    }
    if (elements.themeSystem) {
        elements.themeSystem.addEventListener('click', enableSystemTheme);
    }

    // WebSocket连接
    elements.connectWs.addEventListener('click', toggleWebSocketConnection);
}

function initThemeMode() {
    const savedMode = localStorage.getItem('theme-mode');
    const initialMode = ['light', 'dark'].includes(savedMode) ? savedMode : 'system';
    applyThemeMode(initialMode, false);

    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const onSystemThemeChange = () => {
            const mode = document.body.getAttribute('data-theme-mode') || 'system';
            if (mode === 'system') {
                applyThemeMode('system', false);
            }
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', onSystemThemeChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(onSystemThemeChange);
        }
    }
}

function applyThemeMode(mode, saveMode) {
    const normalizedMode = ['system', 'light', 'dark'].includes(mode) ? mode : 'system';
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = normalizedMode === 'system' ? (systemDark ? 'dark' : 'light') : normalizedMode;

    document.body.setAttribute('data-theme-mode', normalizedMode);
    document.body.setAttribute('data-theme', resolvedTheme);
    updateThemeToggleButton(resolvedTheme, normalizedMode);
    updateThemeSystemButton(normalizedMode);

    if (saveMode) {
        if (normalizedMode === 'system') {
            localStorage.removeItem('theme-mode');
        } else {
            localStorage.setItem('theme-mode', normalizedMode);
        }
    }
}

function updateThemeToggleButton(resolvedTheme, mode) {
    if (!elements.themeToggle) return;

    const isDark = resolvedTheme === 'dark';
    elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
    elements.themeToggle.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');

    if (mode === 'system') {
        elements.themeToggle.title = `跟随系统（当前${isDark ? '深色' : '浅色'}，点击改为手动${isDark ? '浅色' : '深色'}）`;
    } else {
        elements.themeToggle.title = isDark ? '当前深色，点击切换到浅色' : '当前浅色，点击切换到深色';
    }
}

function updateThemeSystemButton(mode) {
    if (!elements.themeSystem) return;
    const isSystem = mode === 'system';
    elements.themeSystem.classList.toggle('active', isSystem);
    elements.themeSystem.setAttribute('aria-pressed', String(isSystem));
    elements.themeSystem.title = isSystem ? '当前已跟随系统' : '点击切换为跟随系统';
}

function toggleThemeMode() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const nextMode = currentTheme === 'dark' ? 'light' : 'dark';
    applyThemeMode(nextMode, true);
}

function enableSystemTheme() {
    applyThemeMode('system', true);
}

function updateOwnerControls() {
    const hasOwnerSecret = !!elements.ownerSecret.value.trim();
    const ownerConfigured = !!serverConfig.ownerSecretConfigured;

    const authButtons = [elements.queryAuth, elements.addAuth, elements.reduceAuth, elements.deleteAuth];
    authButtons.forEach(button => {
        button.disabled = !ownerConfigured || !hasOwnerSecret;
        if (button.disabled) {
            button.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            button.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    const webhookModifyButtons = [elements.saveWebhookTargets, elements.toggleWebhook];
    webhookModifyButtons.forEach(button => {
        button.disabled = !ownerConfigured || !hasOwnerSecret;
        if (button.disabled) {
            button.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            button.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    if (!ownerConfigured) {
        elements.ownerTip.textContent = '安全模式：服务端未配置主人密钥，已禁止所有授权操作。';
        return;
    }

    elements.ownerTip.textContent = hasOwnerSecret
        ? '已输入主人密钥：可执行授权与Webhook管理操作。'
        : '安全模式：未填写主人密钥时，已禁止所有授权操作。';
}

function updateWebhookToggleButton() {
    if (!elements.toggleWebhook) return;
    const enabled = !!serverConfig.webhook;
    elements.toggleWebhook.textContent = enabled ? '关闭WebHook转发' : '开启WebHook转发';
    elements.toggleWebhook.classList.remove('bg-purple-600', 'hover:bg-purple-700', 'bg-gray-600', 'hover:bg-gray-700');
    if (enabled) {
        elements.toggleWebhook.classList.add('bg-gray-600', 'hover:bg-gray-700');
    } else {
        elements.toggleWebhook.classList.add('bg-purple-600', 'hover:bg-purple-700');
    }
}

function showWebhookResult(result, isError = false) {
    elements.webhookResult.classList.remove('hidden');
    const message = (result && result.message) ? result.message : (isError ? '操作失败' : '操作成功');
    const urls = Array.isArray(result?.urls) ? result.urls : [];

    let html = `<p><strong>状态:</strong> ${message}</p>`;
    if (typeof result?.webhook === 'boolean') {
        html += `<p><strong>转发开关:</strong> ${result.webhook ? '已启用' : '已禁用'}</p>`;
    }
    if (result?.secret) {
        html += `<p><strong>目标密钥:</strong> ${result.secret}</p>`;
    }
    if (urls.length > 0) {
        html += `<p><strong>当前URL数量:</strong> ${urls.length}</p>`;
    }

    elements.webhookResultContent.innerHTML = html;
}

async function loadWebhookTargets() {
    const secret = elements.webhookSecret.value.trim();
    if (!secret) {
        addClientLog('请输入要读取的Webhook目标密钥', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/webhook/targets?secret=${encodeURIComponent(secret)}`);
        const result = await response.json();

        if (!response.ok) {
            showWebhookResult(result, true);
            addClientLog(`读取Webhook转发目标失败: ${result.message || '请求异常'}`, 'error');
            return;
        }

        const urls = Array.isArray(result.urls) ? result.urls : [];
        elements.webhookUrls.value = urls.join('\n');
        if (typeof result.webhook === 'boolean') {
            serverConfig.webhook = result.webhook;
            updateWebhookToggleButton();
        }

        showWebhookResult({
            message: '已读取Webhook转发配置',
            secret: result.secret,
            webhook: result.webhook,
            urls
        });
        addClientLog(`读取Webhook转发目标成功: ${secret}（${urls.length}条）`, 'success');
    } catch (error) {
        showWebhookResult({ message: error.message }, true);
        addClientLog(`读取Webhook转发目标失败: ${error.message}`, 'error');
    }
}

async function saveWebhookTargets() {
    const secret = elements.webhookSecret.value.trim();
    const ownerSecret = elements.ownerSecret.value.trim();
    if (!secret) {
        addClientLog('请输入要保存的Webhook目标密钥', 'warning');
        return;
    }
    if (!ownerSecret) {
        addClientLog('保存Webhook转发目标需要主人密钥', 'warning');
        return;
    }

    const urls = elements.webhookUrls.value
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);

    try {
        const response = await fetch('/api/webhook/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret,
                urls,
                owner_secret: ownerSecret
            })
        });
        const result = await response.json();

        showWebhookResult(result, !response.ok);
        if (!response.ok) {
            addClientLog(`保存Webhook转发目标失败: ${result.message || '请求异常'}`, 'error');
            return;
        }

        addClientLog(`保存Webhook转发目标成功: ${secret}（${urls.length}条）`, 'success');
    } catch (error) {
        showWebhookResult({ message: error.message }, true);
        addClientLog(`保存Webhook转发目标失败: ${error.message}`, 'error');
    }
}

async function toggleWebhookSwitch() {
    if (webhookToggleBusy) return;

    const ownerSecret = elements.ownerSecret.value.trim();
    if (!ownerSecret) {
        addClientLog('切换Webhook转发开关需要主人密钥', 'warning');
        return;
    }

    webhookToggleBusy = true;
    elements.toggleWebhook.disabled = true;

    const targetEnabled = !serverConfig.webhook;

    try {
        const response = await fetch('/api/webhook/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled: targetEnabled,
                owner_secret: ownerSecret
            })
        });
        const result = await response.json();

        showWebhookResult(result, !response.ok);
        if (!response.ok) {
            addClientLog(`切换Webhook转发开关失败: ${result.message || '请求异常'}`, 'error');
            return;
        }

        serverConfig.webhook = !!result.webhook;
        updateWebhookToggleButton();
        elements.webhookMode.textContent = serverConfig.webhook ? '已启用' : '未启用';
        addClientLog(`Webhook转发开关已${serverConfig.webhook ? '开启' : '关闭'}`, 'success');
    } catch (error) {
        showWebhookResult({ message: error.message }, true);
        addClientLog(`切换Webhook转发开关失败: ${error.message}`, 'error');
    } finally {
        webhookToggleBusy = false;
        elements.toggleWebhook.disabled = false;
    }
}

// 处理授权操作
async function handleAuthAction(actionType) {
    const secret = elements.secret.value.trim();
    if (!secret) {
        addClientLog('请输入密钥', 'warning');
        return;
    }
    
    const hours = parseInt(elements.hours.value) || 0;
    const ownerSecret = elements.ownerSecret.value.trim();
    let actionName = '';
    
    switch (actionType) {
        case 1: actionName = '查询'; break;
        case 2: actionName = '添加'; break;
        case 3: actionName = '减少'; break;
        case 4: actionName = '删除'; break;
    }
    
    if ([2, 3, 4].includes(actionType) && !ownerSecret) {
        addClientLog('修改授权需要主人密钥', 'warning');
        return;
    }

    try {
        addClientLog(`正在${actionName}授权: ${secret}`, 'info');

        const query = new URLSearchParams({
            secret,
            cz: String(actionType),
            hours: String(hours)
        });

        if ([2, 3, 4].includes(actionType) && ownerSecret) {
            query.set('owner_secret', ownerSecret);
        }

        const response = await fetch(`/sign?${query.toString()}`);
        const result = await response.json();

        showAuthResult(result);
        if (!response.ok) {
            addClientLog(`${actionName}授权失败: ${result.message || '无权限或请求异常'}`, 'error');
            return;
        }
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
        
        // 更新页脚年份范围（2024-今年）
        (function updateCopyrightYearRange() {
            const el = document.getElementById('copyright-year-range');
            if (!el) return;
        
            const startYear = 2024;
            const currentYear = new Date().getFullYear();
            el.textContent = currentYear > startYear ? `${startYear}-${currentYear}` : `${startYear}`;
        })();
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