#!/bin/bash
set -e

REGISTRY="${REGISTRY:-rg.fr-par.scw.cloud/riff-app}"
TAG="${1:-latest}"

echo "==> Building images..."
docker build -t "${REGISTRY}/api:${TAG}" -f Dockerfile .
docker build -t "${REGISTRY}/frontend:${TAG}" -f web/Dockerfile ./web

echo "==> Pushing to registry..."
docker push "${REGISTRY}/api:${TAG}"
docker push "${REGISTRY}/frontend:${TAG}"

echo "==> Done! Images pushed:"
echo "    ${REGISTRY}/api:${TAG}"
echo "    ${REGISTRY}/frontend:${TAG}"
echo ""
echo "On server, run:"
echo "  docker compose -f docker-compose.prod.yml pull"
echo "  docker compose -f docker-compose.prod.yml up -d"
