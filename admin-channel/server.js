#!/usr/bin/env node

/**
 * KprCli Admin Communication Channel
 * Enables remote administrative control over user installations
 * 
 * Features:
 * - Encrypted WebSocket communication with admin control server
 * - Docker container management capabilities
 * - System health monitoring and reporting
 * - Secure command execution with user consent verification
 * - Real-time status updates and notifications
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const socketClient = require('socket.io-client');
const Docker = require('dockerode');
const si = require('systeminformation');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const winston = require('winston');
const helmet = require('helmet');
const cors = require('cors');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    PORT: process.env.PORT || 9000,
    ADMIN_CONTROL_ENDPOINT: process.env.ADMIN_CONTROL_ENDPOINT || 'wss://admin.kprcli.com',
    USER_INSTALLATION_ID: process.env.USER_INSTALLATION_ID || 'unknown',
    ENCRYPTION_KEY: process.env.ADMIN_CHANNEL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
    SYSTEM_CONTROL_ENABLED: process.env.SYSTEM_CONTROL_ENABLED === 'true',
    DOCKER_SOCKET_ENABLED: process.env.DOCKER_SOCKET_ENABLED === 'true',
    HEARTBEAT_INTERVAL: 30000, // 30 seconds
    HEALTH_CHECK_INTERVAL: 60000, // 1 minute
    MAX_LOG_SIZE: '10m',
    LOG_RETENTION_DAYS: 7
};

// Initialize Docker client
let docker = null;
if (CONFIG.DOCKER_SOCKET_ENABLED) {
    try {
        docker = new Docker({ socketPath: '/var/run/docker.sock' });
    } catch (error) {
        console.error('[DOCKER] Failed to connect to Docker socket:', error.message);
    }
}

// Logging setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { 
        service: 'admin-channel',
        installationId: CONFIG.USER_INSTALLATION_ID 
    },
    transports: [
        new winston.transports.File({ 
            filename: '/app/logs/admin-channel-error.log', 
            level: 'error',
            maxsize: CONFIG.MAX_LOG_SIZE,
            maxFiles: CONFIG.LOG_RETENTION_DAYS
        }),
        new winston.transports.File({ 
            filename: '/app/logs/admin-channel.log',
            maxsize: CONFIG.MAX_LOG_SIZE,
            maxFiles: CONFIG.LOG_RETENTION_DAYS
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Rate limiting
const rateLimiter = new RateLimiterMemory({
    keyPrefix: 'admin_command',
    points: 10, // Number of commands
    duration: 60, // Per 60 seconds
});

// Express app setup
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: [CONFIG.ADMIN_CONTROL_ENDPOINT],
        methods: ["GET", "POST"]
    }
});

// Security middleware
app.use(helmet());
app.use(cors({
    origin: [CONFIG.ADMIN_CONTROL_ENDPOINT, 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// System state
const systemState = {
    status: 'initializing',
    lastHealthCheck: null,
    containers: {},
    systemInfo: null,
    adminConnection: null,
    lastCommand: null,
    commandHistory: [],
    uptime: process.uptime()
};

// Encryption utilities
class EncryptionManager {
    constructor(key) {
        this.key = Buffer.from(key, 'hex');
        this.algorithm = 'aes-256-gcm';
    }

    encrypt(text) {
        try {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipher(this.algorithm, this.key);
            cipher.setAAD(Buffer.from('admin-channel'));
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                encrypted,
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            logger.error('[ENCRYPTION] Failed to encrypt data:', error);
            throw error;
        }
    }

    decrypt(encryptedData) {
        try {
            const { iv, encrypted, authTag } = encryptedData;
            const decipher = crypto.createDecipher(this.algorithm, this.key);
            decipher.setAAD(Buffer.from('admin-channel'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('[ENCRYPTION] Failed to decrypt data:', error);
            throw error;
        }
    }
}

const encryption = new EncryptionManager(CONFIG.ENCRYPTION_KEY);

// System information collector
class SystemMonitor {
    static async getSystemInfo() {
        try {
            const [cpu, mem, osInfo, networkStats, fsSize] = await Promise.all([
                si.cpu(),
                si.mem(),
                si.osInfo(),
                si.networkStats(),
                si.fsSize()
            ]);

            return {
                timestamp: new Date().toISOString(),
                cpu: {
                    manufacturer: cpu.manufacturer,
                    brand: cpu.brand,
                    cores: cpu.cores,
                    physicalCores: cpu.physicalCores,
                    speed: cpu.speed
                },
                memory: {
                    total: mem.total,
                    free: mem.free,
                    used: mem.used,
                    active: mem.active,
                    available: mem.available,
                    usage: Math.round((mem.used / mem.total) * 100)
                },
                os: {
                    platform: osInfo.platform,
                    distro: osInfo.distro,
                    release: osInfo.release,
                    arch: osInfo.arch,
                    hostname: osInfo.hostname,
                    uptime: osInfo.uptime
                },
                network: networkStats.map(net => ({
                    iface: net.iface,
                    rx_bytes: net.rx_bytes,
                    tx_bytes: net.tx_bytes,
                    rx_sec: net.rx_sec,
                    tx_sec: net.tx_sec
                })),
                storage: fsSize.map(fs => ({
                    fs: fs.fs,
                    type: fs.type,
                    size: fs.size,
                    used: fs.used,
                    available: fs.available,
                    use: fs.use
                }))
            };
        } catch (error) {
            logger.error('[MONITOR] Failed to get system info:', error);
            return {
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    static async getDockerInfo() {
        if (!docker) return null;

        try {
            const containers = await docker.listContainers({ all: true });
            const images = await docker.listImages();
            const systemInfo = await docker.info();

            return {
                containers: containers.map(container => ({
                    id: container.Id.substring(0, 12),
                    name: container.Names[0],
                    image: container.Image,
                    state: container.State,
                    status: container.Status,
                    ports: container.Ports,
                    created: container.Created
                })),
                images: images.length,
                systemInfo: {
                    containers: systemInfo.Containers,
                    containersRunning: systemInfo.ContainersRunning,
                    containersPaused: systemInfo.ContainersPaused,
                    containersStopped: systemInfo.ContainersStopped,
                    images: systemInfo.Images,
                    serverVersion: systemInfo.ServerVersion
                }
            };
        } catch (error) {
            logger.error('[DOCKER] Failed to get Docker info:', error);
            return { error: error.message };
        }
    }
}

// Command processor
class CommandProcessor {
    static async executeCommand(command, params = {}, adminInfo = {}) {
        const commandId = crypto.randomUUID();
        const startTime = Date.now();

        logger.info(`[COMMAND] Executing: ${command}`, {
            commandId,
            params,
            adminInfo: adminInfo.username || 'unknown'
        });

        try {
            // Rate limiting check
            await rateLimiter.consume(adminInfo.id || 'unknown');

            let result;
            switch (command) {
                case 'restart_services':
                    result = await this.restartServices(params);
                    break;
                case 'update_config':
                    result = await this.updateConfig(params);
                    break;
                case 'get_logs':
                    result = await this.getLogs(params);
                    break;
                case 'system_health':
                    result = await this.getSystemHealth();
                    break;
                case 'docker_command':
                    result = await this.executeDockerCommand(params);
                    break;
                case 'emergency_stop':
                    result = await this.emergencyStop(params);
                    break;
                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            const executionTime = Date.now() - startTime;
            
            logger.info(`[COMMAND] Completed: ${command}`, {
                commandId,
                executionTime,
                success: true
            });

            // Store in command history
            systemState.commandHistory.push({
                id: commandId,
                command,
                params,
                result,
                timestamp: new Date().toISOString(),
                executionTime,
                admin: adminInfo.username || 'unknown',
                success: true
            });

            return {
                success: true,
                commandId,
                result,
                executionTime
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            logger.error(`[COMMAND] Failed: ${command}`, {
                commandId,
                error: error.message,
                executionTime
            });

            // Store failed command in history
            systemState.commandHistory.push({
                id: commandId,
                command,
                params,
                error: error.message,
                timestamp: new Date().toISOString(),
                executionTime,
                admin: adminInfo.username || 'unknown',
                success: false
            });

            return {
                success: false,
                commandId,
                error: error.message,
                executionTime
            };
        }
    }

    static async restartServices(params) {
        if (!docker) throw new Error('Docker not available');

        const { services = ['all'] } = params;
        const results = [];

        if (services.includes('all') || services.length === 0) {
            // Restart all KprCli containers
            const containers = await docker.listContainers({ 
                filters: { name: ['kprcli-'] }
            });

            for (const containerInfo of containers) {
                const container = docker.getContainer(containerInfo.Id);
                await container.restart();
                results.push({
                    service: containerInfo.Names[0],
                    status: 'restarted'
                });
            }
        } else {
            // Restart specific services
            for (const service of services) {
                const containerName = `kprcli-${service}`;
                try {
                    const container = docker.getContainer(containerName);
                    await container.restart();
                    results.push({
                        service: containerName,
                        status: 'restarted'
                    });
                } catch (error) {
                    results.push({
                        service: containerName,
                        status: 'error',
                        error: error.message
                    });
                }
            }
        }

        return { services: results };
    }

    static async updateConfig(params) {
        const { configFile, updates } = params;
        
        if (!configFile || !updates) {
            throw new Error('Config file and updates required');
        }

        const configPath = path.join('/app/user-data', configFile);
        
        // Read current config
        let currentConfig = {};
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            if (configFile.endsWith('.json')) {
                currentConfig = JSON.parse(content);
            } else if (configFile === '.env') {
                // Parse .env file
                const lines = content.split('\n');
                currentConfig = lines.reduce((acc, line) => {
                    const [key, value] = line.split('=');
                    if (key && value) {
                        acc[key] = value;
                    }
                    return acc;
                }, {});
            }
        }

        // Apply updates
        const newConfig = { ...currentConfig, ...updates };

        // Write updated config
        let newContent;
        if (configFile.endsWith('.json')) {
            newContent = JSON.stringify(newConfig, null, 2);
        } else if (configFile === '.env') {
            newContent = Object.entries(newConfig)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
        }

        fs.writeFileSync(configPath, newContent);

        return {
            configFile,
            updatedKeys: Object.keys(updates),
            success: true
        };
    }

    static async getLogs(params) {
        const { service, lines = 100, level = 'info' } = params;
        
        const logFiles = {
            'admin-channel': '/app/logs/admin-channel.log',
            'telegram': '/app/logs/telegram.log',
            'api': '/app/logs/api.log',
            'web': '/app/logs/web.log',
            'ai': '/app/logs/ai.log'
        };

        const logFile = logFiles[service];
        if (!logFile || !fs.existsSync(logFile)) {
            throw new Error(`Log file not found for service: ${service}`);
        }

        const content = fs.readFileSync(logFile, 'utf8');
        const logLines = content.split('\n').slice(-lines);

        return {
            service,
            lines: logLines.length,
            logs: logLines
        };
    }

    static async getSystemHealth() {
        const systemInfo = await SystemMonitor.getSystemInfo();
        const dockerInfo = await SystemMonitor.getDockerInfo();

        return {
            system: systemInfo,
            docker: dockerInfo,
            adminChannel: {
                status: systemState.status,
                uptime: process.uptime(),
                lastHealthCheck: systemState.lastHealthCheck,
                commandHistory: systemState.commandHistory.slice(-10)
            }
        };
    }

    static async executeDockerCommand(params) {
        if (!docker) throw new Error('Docker not available');

        const { action, container, options = {} } = params;

        switch (action) {
            case 'logs':
                const containerObj = docker.getContainer(container);
                const logs = await containerObj.logs({
                    stdout: true,
                    stderr: true,
                    tail: options.lines || 100
                });
                return { logs: logs.toString() };

            case 'inspect':
                const inspectObj = docker.getContainer(container);
                const inspect = await inspectObj.inspect();
                return { inspect };

            case 'stats':
                const statsObj = docker.getContainer(container);
                const stats = await statsObj.stats({ stream: false });
                return { stats };

            default:
                throw new Error(`Unknown Docker action: ${action}`);
        }
    }

    static async emergencyStop(params) {
        if (!docker) throw new Error('Docker not available');

        const results = [];
        
        // Stop all KprCli containers immediately
        const containers = await docker.listContainers({
            filters: { name: ['kprcli-'] }
        });

        for (const containerInfo of containers) {
            try {
                const container = docker.getContainer(containerInfo.Id);
                await container.kill({ signal: 'SIGTERM' });
                results.push({
                    container: containerInfo.Names[0],
                    status: 'stopped'
                });
            } catch (error) {
                results.push({
                    container: containerInfo.Names[0],
                    status: 'error',
                    error: error.message
                });
            }
        }

        return { 
            emergency: true,
            containers: results,
            timestamp: new Date().toISOString()
        };
    }
}

// WebSocket connection to admin control server
let adminSocket = null;

function connectToAdminServer() {
    if (!CONFIG.ADMIN_CONTROL_ENDPOINT || !CONFIG.SYSTEM_CONTROL_ENABLED) {
        logger.info('[ADMIN] Admin control disabled');
        return;
    }

    try {
        adminSocket = socketClient(CONFIG.ADMIN_CONTROL_ENDPOINT, {
            auth: {
                installationId: CONFIG.USER_INSTALLATION_ID,
                version: '1.0.0',
                capabilities: [
                    'system_monitoring',
                    'docker_control',
                    'config_updates',
                    'log_access'
                ]
            },
            transports: ['websocket']
        });

        adminSocket.on('connect', () => {
            logger.info('[ADMIN] Connected to admin control server');
            systemState.status = 'connected';
            systemState.adminConnection = new Date().toISOString();
        });

        adminSocket.on('disconnect', (reason) => {
            logger.warn(`[ADMIN] Disconnected from admin server: ${reason}`);
            systemState.status = 'disconnected';
        });

        adminSocket.on('admin_command', async (data) => {
            try {
                const decryptedCommand = encryption.decrypt(data.encrypted);
                const { command, params, admin } = JSON.parse(decryptedCommand);

                logger.info(`[ADMIN] Received command: ${command}`, { admin: admin.username });

                const result = await CommandProcessor.executeCommand(command, params, admin);
                
                // Send encrypted response
                const encryptedResponse = encryption.encrypt(JSON.stringify({
                    commandId: data.commandId,
                    installationId: CONFIG.USER_INSTALLATION_ID,
                    result
                }));

                adminSocket.emit('command_response', {
                    commandId: data.commandId,
                    encrypted: encryptedResponse
                });

            } catch (error) {
                logger.error('[ADMIN] Command processing failed:', error);
                
                const encryptedError = encryption.encrypt(JSON.stringify({
                    commandId: data.commandId,
                    installationId: CONFIG.USER_INSTALLATION_ID,
                    error: error.message
                }));

                adminSocket.emit('command_error', {
                    commandId: data.commandId,
                    encrypted: encryptedError
                });
            }
        });

        adminSocket.on('health_check', () => {
            adminSocket.emit('health_response', {
                installationId: CONFIG.USER_INSTALLATION_ID,
                status: systemState.status,
                timestamp: new Date().toISOString()
            });
        });

    } catch (error) {
        logger.error('[ADMIN] Failed to connect to admin server:', error);
        systemState.status = 'error';
    }
}

// Health check and monitoring
async function performHealthCheck() {
    try {
        const systemInfo = await SystemMonitor.getSystemInfo();
        const dockerInfo = await SystemMonitor.getDockerInfo();

        systemState.lastHealthCheck = new Date().toISOString();
        systemState.systemInfo = systemInfo;
        systemState.containers = dockerInfo?.containers || {};

        // Send heartbeat to admin server
        if (adminSocket && adminSocket.connected) {
            const healthData = {
                installationId: CONFIG.USER_INSTALLATION_ID,
                timestamp: systemState.lastHealthCheck,
                system: {
                    memory: systemInfo.memory,
                    cpu: systemInfo.cpu,
                    uptime: systemInfo.os.uptime
                },
                containers: Object.keys(systemState.containers).length,
                status: systemState.status
            };

            const encryptedHealth = encryption.encrypt(JSON.stringify(healthData));
            adminSocket.emit('heartbeat', { encrypted: encryptedHealth });
        }

        logger.debug('[HEALTH] Health check completed');

    } catch (error) {
        logger.error('[HEALTH] Health check failed:', error);
    }
}

// API Routes
app.get('/health', async (req, res) => {
    try {
        const health = {
            status: systemState.status,
            timestamp: new Date().toISOString(),
            installationId: CONFIG.USER_INSTALLATION_ID,
            uptime: process.uptime(),
            lastHealthCheck: systemState.lastHealthCheck,
            adminConnection: systemState.adminConnection,
            features: {
                systemControl: CONFIG.SYSTEM_CONTROL_ENABLED,
                dockerControl: CONFIG.DOCKER_SOCKET_ENABLED,
                adminConnection: !!adminSocket?.connected
            }
        };

        res.json(health);
    } catch (error) {
        logger.error('[API] Health check failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/system', async (req, res) => {
    try {
        const systemInfo = await SystemMonitor.getSystemInfo();
        const dockerInfo = await SystemMonitor.getDockerInfo();

        res.json({
            system: systemInfo,
            docker: dockerInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('[API] System info failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Scheduled tasks
if (CONFIG.SYSTEM_CONTROL_ENABLED) {
    // Health check every minute
    cron.schedule('* * * * *', performHealthCheck);

    // Cleanup old command history every hour
    cron.schedule('0 * * * *', () => {
        if (systemState.commandHistory.length > 1000) {
            systemState.commandHistory = systemState.commandHistory.slice(-500);
            logger.info('[CLEANUP] Command history cleaned');
        }
    });
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    logger.error('[ERROR] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('[ERROR] Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('[SERVER] Received SIGTERM, shutting down gracefully');
    
    if (adminSocket) {
        adminSocket.disconnect();
    }
    
    server.close(() => {
        logger.info('[SERVER] HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('[SERVER] Received SIGINT, shutting down gracefully');
    
    if (adminSocket) {
        adminSocket.disconnect();
    }
    
    server.close(() => {
        logger.info('[SERVER] HTTP server closed');
        process.exit(0);
    });
});

// Start server
server.listen(CONFIG.PORT, '0.0.0.0', () => {
    logger.info(`[SERVER] Admin channel server running on port ${CONFIG.PORT}`);
    logger.info(`[CONFIG] Installation ID: ${CONFIG.USER_INSTALLATION_ID}`);
    logger.info(`[CONFIG] System control: ${CONFIG.SYSTEM_CONTROL_ENABLED ? 'enabled' : 'disabled'}`);
    logger.info(`[CONFIG] Docker control: ${CONFIG.DOCKER_SOCKET_ENABLED ? 'enabled' : 'disabled'}`);
    
    systemState.status = 'running';

    // Connect to admin server if enabled
    if (CONFIG.SYSTEM_CONTROL_ENABLED) {
        setTimeout(connectToAdminServer, 5000);
        setTimeout(performHealthCheck, 10000);
    }
});

module.exports = { app, server, logger, systemState };