#!/bin/bash
set -e

echo "=== Riff Deploy Script ==="
echo "Started at $(date)"

# Pull latest code
echo "Pulling latest changes..."
git pull

# Build frontend
echo "Building frontend..."
cd web
npm ci --silent
npm run build
cd ..

# Build and restart containers
echo "Building and restarting containers..."
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Cleanup old images
echo "Cleaning up old images..."
docker image prune -f

echo "=== Deploy complete at $(date) ==="
echo "Check status: docker compose -f docker-compose.prod.yml ps"
echo "View logs: docker compose -f docker-compose.prod.yml logs -f"
