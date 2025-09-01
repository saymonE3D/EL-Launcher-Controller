const express = require('express');
const processManager = require('../service/processManager');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    try {
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            processes: {
                total: processManager.getProcesses().length,
                running: processManager.getProcesses().filter(p => p.status === 'running').length
            },
            version: process.version,
            environment: process.env.NODE_ENV || 'development'
        };
        
        res.status(200).json(healthStatus);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Launch processes
router.post('/launch', async (req, res) => {
    console.log('Launch request received:', req.body);
    
    try {
        const { iterations } = req.body;
        const result = await processManager.startLaunch(iterations);
        console.log('Starting launch with', iterations, 'iterations');
        res.json(result);
    } catch (error) {
        console.error('Launch error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get all processes
router.get('/processes', (req, res) => {
    res.json(processManager.getProcesses());
});

// Terminate single process
router.delete('/process/:pid', (req, res) => {
    try {
        const pid = parseInt(req.params.pid);
        const result = processManager.terminateProcess(pid);
        res.json(result);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// Terminate all processes
router.delete('/processes/all', (req, res) => {
    try {
        const result = processManager.terminateAllProcesses();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to terminate all processes' });
    }
});

// Get launch status
router.get('/status', (req, res) => {
    res.json(processManager.getStatus());
});

module.exports = router;