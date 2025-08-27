const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, correlationId, userId, ...meta }) => {
        const logObject = {
            timestamp,
            level,
            message,
            correlationId,
            userId,
            ...meta
        };
        return JSON.stringify(logObject);
    })
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, correlationId, userId, ...meta }) => {
        let logMessage = `${timestamp} [${level}]`;
        if (correlationId) logMessage += ` [${correlationId.slice(0, 8)}]`;
        if (userId) logMessage += ` [User:${userId}]`;
        logMessage += `: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
    })
);

// Create transports
const transports = [
    // Console transport for development
    new winston.transports.Console({
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
        format: consoleFormat
    }),
    
    // Daily rotate file for all logs
    new DailyRotateFile({
        filename: path.join(logsDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat
    }),
    
    // Daily rotate file for error logs only
    new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        level: 'error',
        format: logFormat
    }),
    
    // Daily rotate file for bot interactions
    new DailyRotateFile({
        filename: path.join(logsDir, 'bot-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '7d',
        format: logFormat,
        level: 'info'
    })
];

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports,
    exitOnError: false
});

// Enhanced logger with context support
class ContextLogger {
    constructor(context = {}) {
        this.context = context;
        this.correlationId = context.correlationId || uuidv4();
    }

    _log(level, message, meta = {}) {
        logger.log(level, message, {
            ...this.context,
            ...meta,
            correlationId: this.correlationId
        });
    }

    debug(message, meta = {}) {
        this._log('debug', message, meta);
    }

    info(message, meta = {}) {
        this._log('info', message, meta);
    }

    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }

    error(message, error = null, meta = {}) {
        const errorMeta = error ? {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            }
        } : {};
        
        this._log('error', message, { ...errorMeta, ...meta });
    }

    // Bot-specific logging methods
    botCommand(command, userId, meta = {}) {
        this._log('info', `Bot command: ${command}`, {
            category: 'bot_command',
            command,
            userId,
            ...meta
        });
    }

    botError(error, userId, meta = {}) {
        this.error('Bot error occurred', error, {
            category: 'bot_error',
            userId,
            ...meta
        });
    }

    // Database logging methods
    dbQuery(operation, table, meta = {}) {
        this._log('debug', `Database ${operation} on ${table}`, {
            category: 'database',
            operation,
            table,
            ...meta
        });
    }

    dbError(error, operation, table, meta = {}) {
        this.error(`Database error: ${operation} on ${table}`, error, {
            category: 'database_error',
            operation,
            table,
            ...meta
        });
    }

    // Payment logging methods
    paymentReceived(orderId, amount, currency, userId, meta = {}) {
        this._log('info', `Payment received: ${amount} ${currency}`, {
            category: 'payment',
            orderId,
            amount,
            currency,
            userId,
            ...meta
        });
    }

    paymentError(error, orderId, meta = {}) {
        this.error('Payment processing error', error, {
            category: 'payment_error',
            orderId,
            ...meta
        });
    }

    // Security logging methods
    securityEvent(event, userId, meta = {}) {
        this._log('warn', `Security event: ${event}`, {
            category: 'security',
            event,
            userId,
            ...meta
        });
    }

    // Performance logging methods
    performance(operation, duration, meta = {}) {
        this._log('info', `Performance: ${operation} took ${duration}ms`, {
            category: 'performance',
            operation,
            duration,
            ...meta
        });
    }

    // Create child logger with additional context
    child(additionalContext = {}) {
        return new ContextLogger({
            ...this.context,
            ...additionalContext,
            correlationId: this.correlationId
        });
    }
}

// Helper function to create logger with correlation ID from Telegram context
const createTelegramLogger = (ctx) => {
    const correlationId = uuidv4();
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    
    return new ContextLogger({
        correlationId,
        userId,
        username,
        chatId: ctx.chat?.id,
        messageId: ctx.message?.message_id
    });
};

// Export both the raw winston logger and enhanced context logger
module.exports = {
    logger,
    ContextLogger,
    createTelegramLogger,
    createLogger: (context = {}) => new ContextLogger(context)
};