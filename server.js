const express = require('express');
const path = require('path');
const ProcessManager = require('./processManages');

const app = express();
const PORT = 3000;
const processManager = new ProcessManager();

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.json());
app.use(express.static('public'));

// API Routes
app.post('/api/launch', async (req, res) => {
    console.log('Launch request received:', req.body);
    
    try {
        const { iterations } = req.body;
        const result = await processManager.startLaunch(iterations);
        console.log('Starting launch with', iterations, 'iterations');
        res.json(result);
    } catch (error) {
        console.error('Launch error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/processes', (req, res) => {
    res.json(processManager.getProcesses());
});

app.delete('/api/process/:pid', (req, res) => {
    try {
        const pid = parseInt(req.params.pid);
        const result = processManager.terminateProcess(pid);
        res.json(result);
    } catch (error) {
        const status = error.message === 'Process not found' ? 404 : 500;
        res.status(status).json({ error: error.message });
    }
});

app.delete('/api/processes/all', (req, res) => {
    try {
        const result = processManager.terminateAllProcesses();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json(processManager.getStatus());
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});