# KprCli Admin Communication Channel Dockerfile
# Enables secure remote administrative control

FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    docker-cli \
    curl \
    bash \
    procps \
    util-linux

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs /app/data

# Create healthcheck script
RUN echo '#!/bin/bash\ncurl -f http://localhost:${PORT:-9000}/health || exit 1' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

# Set up user (run as non-root when possible)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S admin-channel -u 1001 -G nodejs

# However, we need docker socket access, so we'll run as root in docker group
RUN addgroup -g 999 docker 2>/dev/null || true && \
    adduser root docker 2>/dev/null || true

# Expose port
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /app/healthcheck.sh

# Environment variables
ENV NODE_ENV=production
ENV PORT=9000

# Volume for logs
VOLUME ["/app/logs", "/app/data"]

# Start the server
CMD ["node", "server.js"]