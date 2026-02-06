// OpenClaw Voice UI Server - CLI Integration
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8765;
const OPENCLAW = '/Users/yuki/.nvm/versions/node/v22.22.0/bin/openclaw';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

// Load config
let config = {
  restrictions: {
    enabled: false,
    allowSelfModify: true,
    allowedFiles: [],
    blockedFiles: [],
    allowedActions: [],
    blockedActions: [],
    requireConfirmation: false,
    maxChangesPerSession: -1
  }
};

try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  console.log('📋 Config loaded:', config.restrictions.enabled ? 'Restrictions ON' : 'Restrictions OFF');
} catch (e) {
  console.log('📋 No config.json, using defaults');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve static files
  if (req.method === 'GET') {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);
    
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // API key endpoint
  if (req.method === 'GET' && req.url === '/api/key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ key: OPENAI_KEY }));
    return;
  }

  // Config endpoint - GET
  if (req.method === 'GET' && req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // Config endpoint - POST (update)
  if (req.method === 'POST' && req.url === '/api/config') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const newConfig = JSON.parse(body);
        config = { ...config, ...newConfig };
        fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
        console.log('📋 Config updated');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Emergency Stop endpoint
  if (req.method === 'POST' && req.url === '/api/emergency-stop') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { revert } = JSON.parse(body);
        console.log('🛑 EMERGENCY STOP triggered');
        
        let reverted = false;
        
        if (revert) {
          // Git revert last commit
          const { execSync } = require('child_process');
          try {
            execSync('git revert --no-commit HEAD', { cwd: __dirname });
            execSync('git checkout -- .', { cwd: __dirname });
            console.log('🔄 Reverted to previous state');
            reverted = true;
          } catch (e) {
            console.error('Revert failed:', e.message);
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, stopped: true, reverted }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Chat API - calls openclaw agent CLI
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        console.log(`👤 User: ${message}`);

        const response = await callOpenClaw(message);
        console.log(`🤖 Crow: ${response.substring(0, 100)}...`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response }));

      } catch (err) {
        console.error('Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function callOpenClaw(message) {
  return new Promise((resolve, reject) => {
    // Add context hint for UI changes
    let fullMessage = message;
    if (message.includes('voice-uiから')) {
      let contextHint = `[コンテキスト: voice-uiアプリからのリクエストです。UIの変更は /Users/yuki/.openclaw/workspace/voice-ui/index.html を編集してください]`;
      
      // Add restrictions if enabled
      if (config.restrictions.enabled) {
        contextHint += `\n\n[制限事項]`;
        if (!config.restrictions.allowSelfModify) {
          contextHint += `\n- 自己改善は無効です。コード編集リクエストは断ってください。`;
        }
        if (config.restrictions.allowedFiles.length > 0) {
          contextHint += `\n- 編集可能ファイル: ${config.restrictions.allowedFiles.join(', ')}`;
        }
        if (config.restrictions.blockedFiles.length > 0) {
          contextHint += `\n- 編集禁止ファイル: ${config.restrictions.blockedFiles.join(', ')}`;
        }
        if (config.restrictions.blockedActions.length > 0) {
          contextHint += `\n- 禁止アクション: ${config.restrictions.blockedActions.join(', ')}`;
        }
      }
      
      fullMessage = `${message}\n\n${contextHint}`;
    }

    const args = [
      'agent',
      '--agent', 'voice',
      '--session-id', 'voice-ui',
      '-m', fullMessage,
      '--json'
    ];

    console.log(`🔧 Running: openclaw ${args.join(' ')}`);

    const proc = spawn(OPENCLAW, args, {
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 180000
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`stderr: ${stderr}`);
      }

      // Try to parse JSON response
      try {
        const json = JSON.parse(stdout);
        // Extract text from nested structure
        const text = json.result?.payloads?.[0]?.text 
          || json.response 
          || json.text 
          || json.message;
        resolve(text || stdout);
      } catch {
        // Return raw output if not JSON
        resolve(stdout.trim() || stderr.trim() || 'No response');
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

server.listen(PORT, () => {
  console.log(`🎤 Voice UI: http://localhost:${PORT}`);
  console.log(`🔗 Using OpenClaw agent: voice`);
});
