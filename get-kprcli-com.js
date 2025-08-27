#!/usr/bin/env node

/**
 * get.kprcli.com Installation Server
 * Serves the KprCli installation script via HTTP
 * Usage: curl -sSL https://get.kprcli.com | bash
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 80;
const INSTALL_SCRIPT_PATH = path.join(__dirname, 'install.sh');

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(cors({
    origin: true,
    credentials: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many installation requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);

// Analytics middleware
const analytics = {
    installations: 0,
    dailyStats: {},
    userAgents: {},
    ips: new Set(),
    errors: []
};

const logInstallation = (req) => {
    const today = new Date().toISOString().split('T')[0];
    const userAgent = req.get('User-Agent') || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;
    
    analytics.installations++;
    analytics.dailyStats[today] = (analytics.dailyStats[today] || 0) + 1;
    analytics.userAgents[userAgent] = (analytics.userAgents[userAgent] || 0) + 1;
    analytics.ips.add(ip);
    
    console.log(`[INSTALL] ${new Date().toISOString()} - ${ip} - ${userAgent}`);
};

// Routes

// Main installation endpoint
app.get('/', (req, res) => {
    try {
        // Check if script exists
        if (!fs.existsSync(INSTALL_SCRIPT_PATH)) {
            console.error('[ERROR] Installation script not found:', INSTALL_SCRIPT_PATH);
            return res.status(500).send('# KprCli Installation Script Not Available\n# Please try again later or contact support\n');
        }

        // Log the installation attempt
        logInstallation(req);

        // Set appropriate headers for shell script
        res.set({
            'Content-Type': 'application/x-sh',
            'Content-Disposition': 'inline; filename="install.sh"',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Stream the installation script
        const scriptContent = fs.readFileSync(INSTALL_SCRIPT_PATH, 'utf8');
        
        // Add installation tracking
        const trackedScript = `#!/bin/bash
# KprCli Installation Script
# Downloaded from: get.kprcli.com
# Timestamp: ${new Date().toISOString()}
# IP: ${req.ip}

# Report installation start
curl -sSf "https://get.kprcli.com/analytics/start" >/dev/null 2>&1 || true

${scriptContent}

# Report installation complete
curl -sSf "https://get.kprcli.com/analytics/complete" >/dev/null 2>&1 || true
`;

        res.send(trackedScript);
        
    } catch (error) {
        console.error('[ERROR] Failed to serve installation script:', error);
        analytics.errors.push({
            timestamp: new Date().toISOString(),
            error: error.message,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        res.status(500).send(`# KprCli Installation Error
# An error occurred while preparing the installation script
# Error: ${error.message}
# Please try again later or contact support
echo "Installation failed. Please try again later."
exit 1
`);
    }
});

// Installation analytics endpoints
app.post('/analytics/start', (req, res) => {
    console.log(`[ANALYTICS] Installation started - ${req.ip}`);
    res.status(200).send('OK');
});

app.post('/analytics/complete', (req, res) => {
    console.log(`[ANALYTICS] Installation completed - ${req.ip}`);
    res.status(200).send('OK');
});

app.get('/analytics/start', (req, res) => {
    console.log(`[ANALYTICS] Installation started - ${req.ip}`);
    res.status(200).send('OK');
});

app.get('/analytics/complete', (req, res) => {
    console.log(`[ANALYTICS] Installation completed - ${req.ip}`);
    res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        installScript: fs.existsSync(INSTALL_SCRIPT_PATH),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        installations: analytics.installations
    };
    
    res.json(health);
});

// Analytics dashboard (simple)
app.get('/stats', (req, res) => {
    const stats = {
        totalInstallations: analytics.installations,
        uniqueIPs: analytics.ips.size,
        dailyStats: analytics.dailyStats,
        topUserAgents: Object.entries(analytics.userAgents)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {}),
        recentErrors: analytics.errors.slice(-10),
        serverInfo: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        }
    };
    
    res.json(stats);
});

// Web interface for stats (HTML)
app.get('/dashboard', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KprCli Installation Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; margin-bottom: 30px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 6px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #667eea; }
        .stat-label { color: #666; margin-top: 5px; }
        .command-box { background: #2d3748; color: #e2e8f0; padding: 20px; border-radius: 6px; font-family: monospace; margin: 20px 0; }
        .refresh-btn { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-bottom: 20px; }
        .refresh-btn:hover { background: #5a67d8; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 KprCli Installation Dashboard</h1>
        
        <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Stats</button>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" id="totalInstallations">Loading...</div>
                <div class="stat-label">Total Installations</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="uniqueIPs">Loading...</div>
                <div class="stat-label">Unique IPs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="todayInstalls">Loading...</div>
                <div class="stat-label">Today's Installs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="serverUptime">Loading...</div>
                <div class="stat-label">Server Uptime</div>
            </div>
        </div>
        
        <h3>📋 Installation Command</h3>
        <div class="command-box">curl -sSL https://get.kprcli.com | bash</div>
        
        <h3>📊 Recent Activity</h3>
        <pre id="dailyStats">Loading...</pre>
        
        <h3>🌐 Top User Agents</h3>
        <pre id="userAgents">Loading...</pre>
        
        <p style="text-align: center; color: #666; margin-top: 40px;">
            <small>KprCli Installation Server v1.0.0</small>
        </p>
    </div>
    
    <script>
        async function loadStats() {
            try {
                const response = await fetch('/stats');
                const stats = await response.json();
                
                document.getElementById('totalInstallations').textContent = stats.totalInstallations;
                document.getElementById('uniqueIPs').textContent = stats.uniqueIPs;
                
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('todayInstalls').textContent = stats.dailyStats[today] || 0;
                
                const uptimeHours = Math.floor(stats.serverInfo.uptime / 3600);
                document.getElementById('serverUptime').textContent = uptimeHours + 'h';
                
                document.getElementById('dailyStats').textContent = JSON.stringify(stats.dailyStats, null, 2);
                document.getElementById('userAgents').textContent = JSON.stringify(stats.topUserAgents, null, 2);
                
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }
        
        loadStats();
        
        // Auto-refresh every 30 seconds
        setInterval(loadStats, 30000);
    </script>
</body>
</html>
    `;
    
    res.send(html);
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).send(`# 404 - Not Found
# The requested resource was not found on get.kprcli.com
# For KprCli installation, use: curl -sSL https://get.kprcli.com | bash
echo "Invalid endpoint. Use: curl -sSL https://get.kprcli.com | bash"
exit 1
`);
});

// Error handler
app.use((error, req, res, next) => {
    console.error('[ERROR]', error);
    analytics.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(500).send(`# KprCli Installation Server Error
# An unexpected error occurred
echo "Installation server error. Please try again later."
exit 1
`);
});

// Start server
app.listen(PORT, () => {
    console.log(`[SERVER] KprCli installation server running on port ${PORT}`);
    console.log(`[SERVER] Installation command: curl -sSL http://localhost:${PORT} | bash`);
    console.log(`[SERVER] Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
    
    // Verify installation script exists
    if (fs.existsSync(INSTALL_SCRIPT_PATH)) {
        console.log(`[SERVER] Installation script loaded: ${INSTALL_SCRIPT_PATH}`);
    } else {
        console.error(`[ERROR] Installation script not found: ${INSTALL_SCRIPT_PATH}`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[SERVER] Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[SERVER] Received SIGINT, shutting down gracefully');
    process.exit(0);
});

module.exports = app;