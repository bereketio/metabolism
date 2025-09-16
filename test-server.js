const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        const html = `
<!DOCTYPE html>
<html>
<head><title>WebSocket Test</title></head>
<body>
    <h1>WebSocket Connection Test</h1>
    <div id="status">Connecting...</div>
    <script>
        const ws = new WebSocket('ws://127.0.0.1:3002');
        const status = document.getElementById('status');
        
        ws.onopen = () => {
            status.textContent = 'Connected successfully!';
            status.style.color = 'green';
            ws.send('Hello Server');
        };
        
        ws.onmessage = (event) => {
            status.textContent = 'Connected and received: ' + event.data;
        };
        
        ws.onerror = (error) => {
            status.textContent = 'Connection failed: ' + error;
            status.style.color = 'red';
        };
        
        ws.onclose = () => {
            status.textContent = 'Connection closed';
            status.style.color = 'orange';
        };
    </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
    console.log('Client connected to test server');
    
    ws.on('message', (message) => {
        console.log('Received:', message.toString());
        ws.send('Echo: ' + message.toString());
    });
    
    ws.on('close', () => {
        console.log('Client disconnected from test server');
    });
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(3002, () => {
    console.log('Test server listening on http://localhost:3002');
});
