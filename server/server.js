const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8765;

const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
}
"@
while ($true) {
    $line = [Console]::ReadLine()
    if ($line -eq "exit") { break }
    if ([string]::IsNullOrWhiteSpace($line)) { Start-Sleep -Milliseconds 10; continue }
    try { Invoke-Expression $line } catch { Write-Error $_ }
}
`;

const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
ps.stderr.on('data', d => console.error('[PS Error]', d.toString()));

function sendCommand(cmd) {
  if (ps.stdin.writable) {
    ps.stdin.write(cmd + '\n');
  }
}

// Option B: the server controls the active Windows application directly.
// The Chrome extension is only a launcher/status UI; it does NOT relay slide commands.
function sendSystemKey(action) {
  const key = action === 'next' ? '{PGDN}' : action === 'prev' ? '{PGUP}' : action === 'pen' ? '+l' : action === 'erase' ? '+a' : null;
  if (!key) return;

  sendCommand(`[System.Windows.Forms.SendKeys]::SendWait('${key}')`);
  console.log(`[Slides Remote] Sent key: ${key}`);
}

function getNetworkAddresses() {
  const addresses = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return [...new Set(addresses)];
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/phone.html') {
    const filePath = path.join(__dirname, 'public', 'phone.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading phone.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/api/status') {
    const addresses = getNetworkAddresses();
    const origin = `http://${addresses[0] || 'localhost'}:${PORT}`;
    const payload = JSON.stringify({
      running: true,
      port: PORT,
      urls: addresses.map((address) => `http://${address}:${PORT}`),
      primaryUrl: origin,
      connections: typeof wss !== 'undefined' ? wss.clients.size : 0,
    });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(payload);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (socket) => {
  console.log('[Slides Remote] Phone connected. Total clients:', wss.clients.size);

  socket.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (e) {
      return;
    }

    if (data.action === 'mousemove') {
      sendCommand(`$p = [System.Windows.Forms.Cursor]::Position; [Mouse]::SetCursorPos($p.X + (${data.dx}), $p.Y + (${data.dy}))`);
    } else if (data.action === 'mousedown') {
      sendCommand(`[Mouse]::mouse_event(2, 0, 0, 0, 0)`);
    } else if (data.action === 'mouseup') {
      sendCommand(`[Mouse]::mouse_event(4, 0, 0, 0, 0)`);
    } else {
      console.log('[Slides Remote] Received from phone:', data);
      if (['next', 'prev', 'pen', 'erase'].includes(data.action)) {
        sendSystemKey(data.action);
      }
    }
  });

  socket.on('close', () => {
    console.log('[Slides Remote] Phone disconnected. Total clients:', wss.clients.size);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nSlide remote server is running!');
  console.log(`On this computer: http://localhost:${PORT}`);
  console.log('On your phone (same WiFi network), open one of these:\n');

  for (const address of getNetworkAddresses()) {
    console.log(`  http://${address}:${PORT}`);
  }

  console.log('\nThe server can now be started from the Chrome extension.');
});
