import { starterPrompts } from './starter_prompts.js';

// Promise-based IndexedDB Wrapper
class VibeDB {
    constructor() {
        this.dbName = 'vibechat_db';
        this.dbVersion = 1;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (e) => reject(e.target.error);
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config');
                }
                if (!db.objectStoreNames.contains('conversations')) {
                    db.createObjectStore('conversations', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
                    msgStore.createIndex('conversationId', 'conversationId', { unique: false });
                }
                if (!db.objectStoreNames.contains('userPrompts')) {
                    db.createObjectStore('userPrompts', { keyPath: 'id' });
                }
            };
        });
    }

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async put(storeName, value, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = key !== undefined ? store.put(value, key) : store.put(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async queryIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const req = index.getAll(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
}

export const db = new VibeDB();

// Initialize database
const dbInitPromise = db.init().then(async () => {
    // Seed initial config
    const apiConfig = await db.get('config', 'apiConfig');
    if (!apiConfig) {
        await db.put('config', {
            apiKey: '',
            activeModel: 'deepseek-v4-pro',
            thinkingMode: 'enabled'
        }, 'apiConfig');
    }
});

// Intercept window.fetch to provide offline mock REST services for /api endpoints
const originalFetch = window.fetch;

window.fetch = async function (input, init) {
    let url = typeof input === 'string' ? input : input.url;
    // Resolve relative URLs to absolute-like pathname
    const dummy = new URL(url, window.location.href);
    const pathname = dummy.pathname;

    if (!pathname.startsWith('/api/')) {
        return originalFetch.apply(this, arguments);
    }

    await dbInitPromise;

    try {
        // GET /api/config
        if (pathname === '/api/config' && (!init || init.method === 'GET' || init.method === 'get')) {
            const conf = await db.get('config', 'apiConfig') || {};
            const resData = {
                hasKey: !!conf.apiKey,
                activeModel: conf.activeModel || 'deepseek-v4-pro',
                thinkingMode: conf.thinkingMode || 'enabled'
            };
            return new Response(JSON.stringify(resData), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST /api/config
        if (pathname === '/api/config' && init && (init.method === 'POST' || init.method === 'post')) {
            const body = JSON.parse(init.body);
            const conf = await db.get('config', 'apiConfig') || {};
            if (body.apiKey !== undefined) conf.apiKey = body.apiKey;
            if (body.activeModel !== undefined) conf.activeModel = body.activeModel;
            if (body.thinkingMode !== undefined) conf.thinkingMode = body.thinkingMode;
            await db.put('config', conf, 'apiConfig');

            const resData = {
                hasKey: !!conf.apiKey,
                activeModel: conf.activeModel || 'deepseek-v4-pro',
                thinkingMode: conf.thinkingMode || 'enabled'
            };
            return new Response(JSON.stringify(resData), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // GET /api/conversations
        if (pathname === '/api/conversations' && (!init || init.method === 'GET' || init.method === 'get')) {
            const convs = await db.getAll('conversations');
            return new Response(JSON.stringify(convs), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST /api/conversations
        if (pathname === '/api/conversations' && init && (init.method === 'POST' || init.method === 'post')) {
            const body = JSON.parse(init.body);
            const newConv = {
                id: Date.now(),
                title: body.title || 'New Chat',
                systemPromptId: body.systemPromptId || null,
                activeModel: 'deepseek-v4-pro',
                createdAt: Date.now()
            };
            await db.put('conversations', newConv);
            return new Response(JSON.stringify(newConv), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // PUT /api/conversations/:id
        const convMatch = pathname.match(/^\/api\/conversations\/(\d+)$/);
        if (convMatch && init && (init.method === 'PUT' || init.method === 'put')) {
            const id = parseInt(convMatch[1], 10);
            const body = JSON.parse(init.body);
            const conv = await db.get('conversations', id);
            if (!conv) {
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
            }
            if (body.title !== undefined) conv.title = body.title;
            if (body.activeModel !== undefined) conv.activeModel = body.activeModel;
            if (body.systemPromptId !== undefined) conv.systemPromptId = body.systemPromptId;
            await db.put('conversations', conv);
            return new Response(JSON.stringify(conv), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // DELETE /api/conversations/:id
        if (convMatch && init && (init.method === 'DELETE' || init.method === 'delete')) {
            const id = parseInt(convMatch[1], 10);
            await db.delete('conversations', id);
            // Cascade delete messages
            const allMsgs = await db.getAll('messages');
            for (const msg of allMsgs) {
                if (msg.conversationId === id) {
                    await db.delete('messages', msg.id);
                }
            }
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // GET /api/messages
        if (pathname === '/api/messages' && (!init || init.method === 'GET' || init.method === 'get')) {
            const conversationId = parseInt(dummy.searchParams.get('conversationId'), 10);
            const allMsgs = await db.getAll('messages');
            const filtered = allMsgs.filter(m => m.conversationId === conversationId);
            return new Response(JSON.stringify(filtered), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST /api/messages
        if (pathname === '/api/messages' && init && (init.method === 'POST' || init.method === 'post')) {
            const body = JSON.parse(init.body);
            const newMsg = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                conversationId: parseInt(body.conversationId, 10),
                role: body.role,
                content: body.content,
                reasoning: body.reasoning || undefined,
                timestamp: body.timestamp || Date.now(),
                parentMsgId: body.parentMsgId !== undefined ? (body.parentMsgId ? parseInt(body.parentMsgId, 10) : null) : null,
                versionGroupId: body.versionGroupId !== undefined ? (body.versionGroupId ? parseInt(body.versionGroupId, 10) : null) : null,
                version: body.version || 1,
                isActive: body.isActive !== undefined ? body.isActive : true
            };

            if (newMsg.role === 'assistant' && !newMsg.versionGroupId) {
                newMsg.versionGroupId = newMsg.id;
            }

            await db.put('messages', newMsg);
            return new Response(JSON.stringify(newMsg), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // PUT /api/messages/:id
        const msgMatch = pathname.match(/^\/api\/messages\/(\d+)$/);
        if (msgMatch && init && (init.method === 'PUT' || init.method === 'put')) {
            const id = parseInt(msgMatch[1], 10);
            const body = JSON.parse(init.body);
            const msg = await db.get('messages', id);
            if (!msg) {
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
            }
            if (body.content !== undefined) msg.content = body.content;
            if (body.isActive !== undefined) msg.isActive = body.isActive;
            if (body.reasoning !== undefined) msg.reasoning = body.reasoning;
            await db.put('messages', msg);
            return new Response(JSON.stringify(msg), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // GET /api/user-prompts
        if (pathname === '/api/user-prompts' && (!init || init.method === 'GET' || init.method === 'get')) {
            const prompts = await db.getAll('userPrompts');
            return new Response(JSON.stringify(prompts), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST /api/user-prompts
        if (pathname === '/api/user-prompts' && init && (init.method === 'POST' || init.method === 'post')) {
            const body = JSON.parse(init.body);
            const id = body.id ? parseInt(body.id, 10) : Date.now() * 1000 + Math.floor(Math.random() * 1000);
            const record = {
                id,
                name: body.name,
                category: body.category || 'Uncategorized',
                content: body.content,
                createdAt: body.createdAt || Date.now()
            };
            await db.put('userPrompts', record);
            return new Response(JSON.stringify(record), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // DELETE /api/user-prompts/:id
        const promptDeleteMatch = pathname.match(/^\/api\/user-prompts\/(\d+)$/);
        if (promptDeleteMatch && init && (init.method === 'DELETE' || init.method === 'delete')) {
            const id = parseInt(promptDeleteMatch[1], 10);
            await db.delete('userPrompts', id);
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // GET /api/prompts
        if (pathname === '/api/prompts' && (!init || init.method === 'GET' || init.method === 'get')) {
            return new Response(JSON.stringify(starterPrompts), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // GET /api/prompts/:category/:filename
        const factoryMatch = pathname.match(/^\/api\/prompts\/([^/]+)\/([^/]+)$/);
        if (factoryMatch && (!init || init.method === 'GET' || init.method === 'get')) {
            const category = decodeURIComponent(factoryMatch[1]);
            const filename = decodeURIComponent(factoryMatch[2]);
            const key = `${category}/${filename}`;
            const content = starterPrompts.contents[key];
            if (!content) {
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
            }
            const name = filename.replace(/_sys_prompt\.md$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return new Response(JSON.stringify({ name, filename, category, content }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST /api/chat/completions -> direct DeepSeek streaming completions!
        if (pathname === '/api/chat/completions' && init && (init.method === 'POST' || init.method === 'post')) {
            const conf = await db.get('config', 'apiConfig');
            const apiKey = conf?.apiKey;
            if (!apiKey) {
                return new Response(JSON.stringify({ error: { message: "API Key is missing. Please configure it in Settings." } }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const body = JSON.parse(init.body);
            let modelToUse = body.model;
            
            // Map models to official ones
            if (modelToUse === 'deepseek-v4-pro' || modelToUse === 'deepseek-v4-flash') {
                modelToUse = (conf.thinkingMode === 'enabled') ? 'deepseek-reasoner' : 'deepseek-chat';
            }

            const payload = {
                model: modelToUse,
                messages: body.messages,
                temperature: body.temperature !== undefined ? body.temperature : 0.7,
                stream: true
            };

            // deepseek-reasoner doesn't support temperature
            if (modelToUse === 'deepseek-reasoner') {
                delete payload.temperature;
            }

            const response = await originalFetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                signal: init.signal,
                body: JSON.stringify(payload)
            });

            return response;
        }

        return new Response(JSON.stringify({ error: 'Endpoint mock not implemented' }), { status: 404 });

    } catch (err) {
        console.error("Fetch interceptor error:", err);
        return new Response(JSON.stringify({ error: { message: err.message } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
