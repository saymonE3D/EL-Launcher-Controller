const express = require('express');

// CORS middleware
const corsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
};

// Setup all middleware
const setupMiddleware = (app) => {
    app.use(corsMiddleware);
    app.use(express.json());
    app.use(express.static('public'));
};

module.exports = { setupMiddleware };