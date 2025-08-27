const Sentry = require('@sentry/node');
const { createLogger } = require('./logger');

class SentryManager {
    constructor() {
        this.logger = createLogger({ component: 'SentryManager' });
        this.isInitialized = false;
    }

    // Initialize Sentry with configuration
    init() {
        const dsn = process.env.SENTRY_DSN;
        
        if (!dsn) {
            this.logger.info('Sentry DSN not provided, error tracking disabled');
            return;
        }

        try {
            Sentry.init({
                dsn: dsn,
                environment: process.env.NODE_ENV || 'development',
                release: `telekpr@${process.env.npm_package_version || '1.0.0'}`,
                
                // Performance monitoring
                tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
                
                // Error filtering
                beforeSend: (event, hint) => {
                    // Filter out specific errors that shouldn't be tracked
                    const error = hint.originalException;
                    
                    if (error && error.message) {
                        // Skip common Telegram bot errors
                        if (error.message.includes('message is not modified') ||
                            error.message.includes('chat not found') ||
                            error.message.includes('blocked by the user')) {
                            return null;
                        }
                        
                        // Skip connection timeouts
                        if (error.message.includes('ECONNRESET') ||
                            error.message.includes('ETIMEDOUT')) {
                            return null;
                        }
                    }
                    
                    return event;
                },
                
                // Additional configuration
                integrations: [
                    new Sentry.Integrations.Http({ tracing: true }),
                    new Sentry.Integrations.Express({ app: null }), // Will be set later
                    new Sentry.Integrations.OnUncaughtException({
                        onFatalError: (err) => {
                            this.logger.error('Fatal error caught by Sentry', err);
                            process.exit(1);
                        }
                    }),
                    new Sentry.Integrations.OnUnhandledRejection({
                        mode: 'warn'
                    })
                ],
                
                // Tag all events with service info
                initialScope: {
                    tags: {
                        service: 'telekpr-bot',
                        component: 'main'
                    }
                }
            });
            
            this.isInitialized = true;
            this.logger.info('Sentry error tracking initialized successfully', {
                environment: process.env.NODE_ENV,
                dsn: dsn.substring(0, 20) + '...'
            });
            
        } catch (error) {
            this.logger.error('Failed to initialize Sentry', error);
        }
    }

    // Configure Express middleware
    setupExpressMiddleware(app) {
        if (!this.isInitialized) return;

        try {
            // Request handler must be the first middleware
            app.use(Sentry.Handlers.requestHandler({
                user: ['id', 'telegram_id', 'username'],
                request: ['url', 'method', 'headers', 'query']
            }));

            // Tracing handler for performance monitoring
            app.use(Sentry.Handlers.tracingHandler());

            this.logger.info('Express Sentry middleware configured');
        } catch (error) {
            this.logger.error('Failed to setup Express Sentry middleware', error);
        }
    }

    // Configure Express error handler (must be called after all routes)
    setupExpressErrorHandler(app) {
        if (!this.isInitialized) return;

        try {
            app.use(Sentry.Handlers.errorHandler({
                shouldHandleError: (error) => {
                    // Capture all errors in production, only 5xx in development
                    return process.env.NODE_ENV === 'production' || error.status >= 500;
                }
            }));

            this.logger.info('Express Sentry error handler configured');
        } catch (error) {
            this.logger.error('Failed to setup Express Sentry error handler', error);
        }
    }

    // Capture exception with context
    captureException(error, context = {}) {
        if (!this.isInitialized) {
            this.logger.error('Attempted to capture exception but Sentry not initialized', error);
            return;
        }

        try {
            Sentry.withScope((scope) => {
                // Add context information
                if (context.user) {
                    scope.setUser({
                        id: context.user.id,
                        telegram_id: context.user.telegram_id,
                        username: context.user.username || context.user.telegram_username
                    });
                }

                if (context.tags) {
                    Object.keys(context.tags).forEach(key => {
                        scope.setTag(key, context.tags[key]);
                    });
                }

                if (context.extra) {
                    Object.keys(context.extra).forEach(key => {
                        scope.setExtra(key, context.extra[key]);
                    });
                }

                if (context.level) {
                    scope.setLevel(context.level);
                }

                if (context.fingerprint) {
                    scope.setFingerprint(context.fingerprint);
                }

                // Set transaction name for better organization
                if (context.transaction) {
                    scope.setTransactionName(context.transaction);
                }

                Sentry.captureException(error);
            });

        } catch (sentryError) {
            this.logger.error('Failed to capture exception in Sentry', sentryError);
        }
    }

    // Capture message with context
    captureMessage(message, level = 'info', context = {}) {
        if (!this.isInitialized) {
            this.logger.warn('Attempted to capture message but Sentry not initialized', { message, level });
            return;
        }

        try {
            Sentry.withScope((scope) => {
                if (context.user) {
                    scope.setUser(context.user);
                }

                if (context.tags) {
                    Object.keys(context.tags).forEach(key => {
                        scope.setTag(key, context.tags[key]);
                    });
                }

                if (context.extra) {
                    Object.keys(context.extra).forEach(key => {
                        scope.setExtra(key, context.extra[key]);
                    });
                }

                scope.setLevel(level);
                Sentry.captureMessage(message);
            });

        } catch (sentryError) {
            this.logger.error('Failed to capture message in Sentry', sentryError);
        }
    }

    // Add breadcrumb for debugging
    addBreadcrumb(message, category = 'custom', level = 'info', data = {}) {
        if (!this.isInitialized) return;

        try {
            Sentry.addBreadcrumb({
                message,
                category,
                level,
                data,
                timestamp: Date.now() / 1000
            });
        } catch (error) {
            this.logger.error('Failed to add breadcrumb', error);
        }
    }

    // Create transaction for performance monitoring
    startTransaction(name, operation = 'custom') {
        if (!this.isInitialized) return null;

        try {
            return Sentry.startTransaction({ name, op: operation });
        } catch (error) {
            this.logger.error('Failed to start transaction', error);
            return null;
        }
    }

    // Set user context globally
    setUser(user) {
        if (!this.isInitialized) return;

        try {
            Sentry.setUser({
                id: user.id,
                telegram_id: user.telegram_id,
                username: user.username || user.telegram_username,
                admin: user.is_admin || user.is_super_admin
            });
        } catch (error) {
            this.logger.error('Failed to set user context', error);
        }
    }

    // Clear user context
    clearUser() {
        if (!this.isInitialized) return;

        try {
            Sentry.setUser(null);
        } catch (error) {
            this.logger.error('Failed to clear user context', error);
        }
    }

    // Force flush events to Sentry (useful for graceful shutdown)
    async flush(timeout = 5000) {
        if (!this.isInitialized) return true;

        try {
            return await Sentry.flush(timeout);
        } catch (error) {
            this.logger.error('Failed to flush Sentry events', error);
            return false;
        }
    }

    // Close Sentry client
    async close(timeout = 5000) {
        if (!this.isInitialized) return true;

        try {
            return await Sentry.close(timeout);
        } catch (error) {
            this.logger.error('Failed to close Sentry client', error);
            return false;
        }
    }

    // Get Sentry instance (for advanced usage)
    getSentry() {
        return this.isInitialized ? Sentry : null;
    }

    // Check if Sentry is available
    isAvailable() {
        return this.isInitialized;
    }
}

// Create singleton instance
const sentryManager = new SentryManager();

module.exports = {
    SentryManager,
    sentryManager
};