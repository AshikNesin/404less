#!/bin/bash
# Simple production deployment script

set -e

echo "🚀 Starting production deployment..."

# Check if .env file exists
if [ ! -f "infra/.env" ]; then
    echo "❌ Error: infra/.env file not found"
    echo "Copy infra/.env.example to infra/.env and configure for production"
    exit 1
fi

# Load environment variables
source infra/.env

# Validate production settings
if [ "$ENV" != "production" ]; then
    echo "⚠️  Warning: ENV is not set to 'production'"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

if [ "$SECRET_KEY" = "dev-secret-key-change-in-production" ]; then
    echo "❌ Error: SECRET_KEY must be changed for production"
    exit 1
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t tiny-backend:latest ./backend

# Stop existing container if it exists
if docker ps -a --format 'table {{.Names}}' | grep -q "^tiny-backend$"; then
    echo "🛑 Stopping existing container..."
    docker stop tiny-backend || true
    docker rm tiny-backend || true
fi

# Run new container
echo "🏃 Running new container..."
docker run -d \
    --name tiny-backend \
    --env-file infra/.env \
    -p 9001:9001 \
    --restart unless-stopped \
    tiny-backend:latest

# Wait for health check
echo "⏳ Waiting for health check..."
sleep 10

# Check health
if curl -f http://localhost:9001/api/healthz > /dev/null 2>&1; then
    echo "✅ Deployment successful!"
    echo "🌐 Application is running at http://localhost:9001"
    echo "📊 Health check: http://localhost:9001/api/health"
else
    echo "❌ Health check failed"
    echo "📋 Logs:"
    docker logs tiny-backend
    exit 1
fi

echo "🎉 Deployment complete!"
