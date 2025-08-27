const { createLogger } = require('./logger');
const { sentryManager } = require('./sentry');

// Custom error classes
class TeleKprError extends Error {
    constructor(message, code = 'TELEKPR_ERROR', statusCode = 500, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends TeleKprError {
    constructor(message, field = null) {
        super(message, 'VALIDATION_ERROR', 400);
        this.field = field;
    }
}

class DatabaseError extends TeleKprError {
    constructor(message, operation = null, table = null) {
        super(message, 'DATABASE_ERROR', 500);
        this.operation = operation;
        this.table = table;
    }
}

class PaymentError extends TeleKprError {
    constructor(message, orderId = null) {
        super(message, 'PAYMENT_ERROR', 402);
        this.orderId = orderId;
    }
}

class AuthenticationError extends TeleKprError {
    constructor(message = 'Authentication required') {
        super(message, 'AUTH_ERROR', 401);
    }
}

class AuthorizationError extends TeleKprError {
    constructor(message = 'Insufficient permissions') {
        super(message, 'AUTHORIZATION_ERROR', 403);
    }
}

class RateLimitError extends TeleKprError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 'RATE_LIMIT_ERROR', 429);
    }
}

// Error handler class
class ErrorHandler {
    constructor() {
        this.logger = createLogger({ component: 'ErrorHandler' });
    }

    // Handle different types of errors
    handleError(error, context = {}) {
        // Log the error
        this.logger.error('Error occurred', error, context);

        // Send to Sentry if available
        if (sentryManager.isAvailable()) {
            sentryManager.captureException(error, {
                tags: {
                    component: context.component || 'unknown',
                    operation: context.operation || 'unknown'
                },
                extra: context,
                level: error.isOperational ? 'warning' : 'error'
            });
        }

        // Determine if error is operational (expected) or programming error
        if (error.isOperational === false) {
            // Programming error - log and potentially crash
            this.logger.error('Non-operational error detected - potential bug', error, context);
            
            // Send critical error to Sentry
            if (sentryManager.isAvailable()) {
                sentryManager.captureMessage('Critical non-operational error detected', 'fatal', {
                    tags: { critical: true },
                    extra: { error: error.message, stack: error.stack, context }
                });
            }
            
            if (process.env.NODE_ENV === 'production') {
                // In production, we might want to restart the process
                this.logger.error('Shutting down due to programming error');
                process.exit(1);
            }
        }

        return this.formatErrorResponse(error);
    }

    // Format error for response
    formatErrorResponse(error) {
        if (error instanceof TeleKprError) {
            return {
                error: {
                    code: error.code,
                    message: error.message,
                    statusCode: error.statusCode
                }
            };
        }

        // Handle known third-party errors
        if (error.code === 'PGRST116') {
            return {
                error: {
                    code: 'NOT_FOUND',
                    message: 'Resource not found',
                    statusCode: 404
                }
            };
        }

        if (error.code === '23505') {
            return {
                error: {
                    code: 'DUPLICATE_ENTRY',
                    message: 'Record already exists',
                    statusCode: 409
                }
            };
        }

        // Unknown error - don't expose details in production
        if (process.env.NODE_ENV === 'production') {
            return {
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'An internal error occurred',
                    statusCode: 500
                }
            };
        }

        return {
            error: {
                code: 'UNKNOWN_ERROR',
                message: error.message || 'Unknown error occurred',
                statusCode: 500
            }
        };
    }

    // Telegram bot error handler
    handleTelegramError(error, ctx) {
        const logger = createLogger({
            component: 'TelegramBot',
            userId: ctx.from?.id,
            chatId: ctx.chat?.id,
            messageId: ctx.message?.message_id
        });

        logger.botError(error, ctx.from?.id, {
            command: ctx.message?.text?.split(' ')[0],
            chatType: ctx.chat?.type
        });

        // Send user-friendly error message
        const userMessage = this.getUserFriendlyMessage(error);
        
        try {
            ctx.reply(userMessage);
        } catch (replyError) {
            logger.error('Failed to send error message to user', replyError);
        }
    }

    // Express error handler middleware
    expressErrorHandler() {
        return (error, req, res, next) => {
            const logger = createLogger({
                component: 'ExpressApp',
                correlationId: req.correlationId,
                method: req.method,
                url: req.url,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            });

            const errorResponse = this.handleError(error, {
                method: req.method,
                url: req.url,
                body: req.body,
                query: req.query,
                headers: req.headers
            });

            res.status(errorResponse.error.statusCode).json(errorResponse);
        };
    }

    // Get user-friendly error message
    getUserFriendlyMessage(error) {
        if (error instanceof ValidationError) {
            return `❌ Invalid input: ${error.message}`;
        }

        if (error instanceof PaymentError) {
            return `💳 Payment error: ${error.message}`;
        }

        if (error instanceof AuthenticationError) {
            return `🔐 Please login to continue`;
        }

        if (error instanceof AuthorizationError) {
            return `🚫 You don't have permission to perform this action`;
        }

        if (error instanceof RateLimitError) {
            return `⏰ Please wait a moment before trying again`;
        }

        if (error instanceof DatabaseError) {
            return `📊 Database temporarily unavailable. Please try again later`;
        }

        // Generic error message
        return `❌ Something went wrong. Please try again or contact support if the problem persists`;
    }

    // Async wrapper for catching errors in async functions
    asyncWrapper(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    // Telegram async wrapper
    telegramAsyncWrapper(handler) {
        return async (ctx, next) => {
            try {
                await handler(ctx, next);
            } catch (error) {
                this.handleTelegramError(error, ctx);
            }
        };
    }
}

// Global error handlers
const errorHandler = new ErrorHandler();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    errorHandler.logger.error('Uncaught Exception', error, { 
        type: 'uncaughtException',
        pid: process.pid 
    });
    
    // Graceful shutdown
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    errorHandler.logger.error('Unhandled Rejection', reason, { 
        type: 'unhandledRejection',
        promise: promise.toString(),
        pid: process.pid 
    });
    
    // Graceful shutdown
    process.exit(1);
});

module.exports = {
    ErrorHandler,
    errorHandler,
    TeleKprError,
    ValidationError,
    DatabaseError,
    PaymentError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError
};