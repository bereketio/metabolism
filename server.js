const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const http = require('http');

const contentTypeDataStyles = {
    'text/plain': { color: 0x00ff00 },
    'text/html': { color: 0x32cd32 },
    'text/javascript': { color: 0x90ee90 },
    'text': { color: 0x00ff00 },
    'image/jpeg': { color: 0xff1493 },
    'image/png': { color: 0xff69b4 },
    'image': { color: 0xff00ff },
    'video': { color: 0x00ffff },
    'audio': { color: 0xffa500 },
    'application/pdf': { color: 0xff0000 },
    'application/json': { color: 0x0000ff },
    'application/zip': { color: 0x8b4513 },
    'application/x-tar': { color: 0x8b4513 },
    'application/gzip': { color: 0x8b4513 },
    'application/x-rar-compressed': { color: 0x8b4513 },
    'application/x-arweave-manifest+json': { color: 0x00ff88 },
    'application': { color: 0x1e90ff },
    'other': { color: 0x808080 }
};

// Fetch all transactions for a given block height using GraphQL pagination
async function fetchAllBlockTransactions(height) {
    const url = 'https://arweave.net/graphql';
    let edges = [];
    let after = null;
    let hasNextPage = true;
    while (hasNextPage) {
        const body = {
            query: `query($min: Int!, $max: Int!, $after: String) {
                transactions(block: {min: $min, max: $max}, sort: HEIGHT_ASC, first: 100, after: $after) {
                    pageInfo { hasNextPage endCursor }
                    edges { node { id data { size } tags { name value } } }
                }
            }`,
            variables: { min: height, max: height, after }
        };
        let resp;
        try {
            resp = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
        } catch (err) {
            // Log GraphQL errors and fallback to single page (first:100)
            const data = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
            console.error('GraphQL page request failed:', data);
            const fallbackBody = {
                query: `query($min: Int!, $max: Int!) {
                    transactions(block: {min: $min, max: $max}, sort: HEIGHT_ASC, first: 100) {
                        edges { node { id data { size } tags { name value } } }
                    }
                }`,
                variables: { min: height, max: height }
            };
            try {
                const fbResp = await axios.post(url, fallbackBody, { headers: { 'Content-Type': 'application/json' } });
                const fbPage = fbResp.data && fbResp.data.data && fbResp.data.data.transactions;
                if (fbPage && fbPage.edges) edges = edges.concat(fbPage.edges);
            } catch (fbErr) {
                console.error('GraphQL fallback failed:', fbErr.response && fbErr.response.data ? fbErr.response.data : fbErr.message);
            }
            break;
        }
        const page = resp.data && resp.data.data && resp.data.data.transactions;
        if (!page) break;
        edges = edges.concat(page.edges || []);
        hasNextPage = page.pageInfo?.hasNextPage;
        after = page.pageInfo?.endCursor || null;
        // Be polite to the endpoint
        if (hasNextPage) await new Promise(r => setTimeout(r, 100));
    }
    return edges;
}

function getTxColor(tx) {
    const contentTypeTag = tx.tags.find(tag => tag.name === 'Content-Type');
    const fullContentType = contentTypeTag ? contentTypeTag.value : 'other';
    const mainContentType = fullContentType.split('/')[0];
    const style = contentTypeDataStyles[fullContentType] || contentTypeDataStyles[mainContentType] || contentTypeDataStyles.other;
    return style.color;
}

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);
const server = http.createServer(app);
app.use(express.static('public'));
const wss = new WebSocket.Server({ noServer: true });

// Helper to find the first block height of a given UTC day
async function findStartHeightForDate(targetDate, ws) {
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
    ws.send(JSON.stringify({ type: 'loadingStatus', message: 'Finding start block for the day...' }));

    try {
        const info = await axios.get('https://arweave.net/info');
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        // Remove future date check - fetch blocks for any requested date

        let high = info.data.height;
        let low = 0;
        let startHeight = -1;

        while (low <= high) {
            let mid = Math.floor(low + (high - low) / 2);
            try {
                const block = (await axios.get(`https://arweave.net/block/height/${mid}`)).data;
                if (block.timestamp >= targetTimestamp) {
                    startHeight = mid;
                    high = mid - 1; // Found a potential start, try to find an even earlier one
                } else {
                    low = mid + 1; // Block is too early, search higher
                }
            } catch (blockError) {
                // This height might not exist, so search lower.
                high = mid - 1;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (startHeight === -1) {
            console.log(`No blocks found at or after the target timestamp. The blockchain may not have reached this date.`);
            return info.data.height + 1; // Return a height that will result in 0 blocks streamed
        }

        console.log(`Found start height for ${targetDate.toDateString()}: ${startHeight}`);
        return startHeight;

    } catch (error) {
        console.error('Error in findStartHeightForDate:', error.message);
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to find start block.' }));
        return 0;
    }
}

async function streamBlocksForDay(ws, date, streamControl, visualOnly = false) {
    let visualBlockSent = false;
    try {
        ws.send(JSON.stringify({ type: 'loadingStatus', message: `Finding start block for ${date.toDateString()}...` }));
        const startHeight = await findStartHeightForDate(date, ws);

        // Calculate end of day timestamp (23:59:59.999)
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const endOfDayTimestamp = Math.floor(endOfDay.getTime() / 1000);

        ws.send(JSON.stringify({ type: 'loadingStatus', message: `Streaming blocks for ${date.toDateString()}...` }));

        let currentHeight = startHeight;
        while (true) {
            if (ws.readyState !== WebSocket.OPEN || streamControl.stop) {
                console.log('WebSocket closed or stream stopped, stopping stream.');
                break;
            }

            try {
                const blockRes = await axios.get(`https://arweave.net/block/height/${currentHeight}`);

                // Check if block timestamp is past the end of the day
                if (blockRes.data.timestamp > endOfDayTimestamp) {
                    console.log(`End of day reached at block ${currentHeight}. Stopping stream.`);
                    break;
                }

                // Fetch full list of transactions for this block (GraphQL pages default to 10)
                const edges = await fetchAllBlockTransactions(currentHeight);
                const transactions = edges.map(edge => ({
                    id: edge.node.id,
                    data_size: edge.node.data.size,
                    tags: edge.node.tags.reduce((acc, tag) => { acc[tag.name] = tag.value; return acc; }, {})
                }));

                const hasVisual = transactions.some(tx => tx.tags['Content-Type'] && tx.tags['Content-Type'].startsWith('image/'));

                if (!visualOnly || hasVisual) {
                    const payload = {
                        type: 'newBlock',
                        data: { ...blockRes.data, height: currentHeight, transactions: transactions, isVisual: hasVisual }
                    };
                    ws.send(JSON.stringify(payload));
                    if (visualOnly && hasVisual) {
                        visualBlockSent = true;
                    }
                }

                currentHeight++;
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`Failed to process block ${currentHeight}:`, error.message);
                currentHeight++; // Skip failed block
            }
        }

        console.log(`Finished streaming ${date.toDateString()}`);

        if (!visualOnly) {
             ws.send(JSON.stringify({ type: 'dayStreamComplete' }));
        }

        return visualBlockSent;

    } catch (error) {
        console.error('Error in streamBlocksForDay:', error.message);
        ws.send(JSON.stringify({ type: 'error', message: 'An error occurred while streaming blocks.' }));
    }
}

let activeStreams = new Map(); // Track active streams per connection

wss.on('connection', ws => {
    console.log('Client connected.');
    
    ws.on('message', message => {
        console.log('Received message from client:', message);
        const parsed = JSON.parse(message);
        console.log('Parsed client message:', parsed);
        if (parsed.type === 'get_day') {
            // Stop any existing stream for this connection
            if (activeStreams.has(ws)) {
                activeStreams.get(ws).stop = true;
            }
            
            const date = new Date(parsed.date);
            console.log(`Requesting data for date: ${date.toUTCString()}`);
            
            // Create stream control object
            const streamControl = { stop: false };
            activeStreams.set(ws, streamControl);
            
            streamBlocksForDay(ws, date, streamControl);
        } else if (parsed.type === 'get_day_visual') {
            if (activeStreams.has(ws)) {
                activeStreams.get(ws).stop = true;
            }
            const date = new Date(parsed.date);
            const streamControl = { stop: false };
            activeStreams.set(ws, streamControl);

            // Search backwards for a day with visual content
            (async () => {
                let searchDate = date;
                for (let i = 0; i < 7; i++) { // Limit search to 7 days
                    const found = await streamBlocksForDay(ws, searchDate, streamControl, true);
                    if (found) {
                        ws.send(JSON.stringify({ type: 'dayStreamComplete' }));
                        break;
                    }
                    if (i === 6) { // If no content found after 7 days
                         ws.send(JSON.stringify({ type: 'error', message: 'No visual content found in the last 7 days.' }));
                    }
                    searchDate.setDate(searchDate.getDate() - 1);
                }
            })();
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        // Clean up active streams for this connection
        if (activeStreams.has(ws)) {
            activeStreams.get(ws).stop = true;
            activeStreams.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
