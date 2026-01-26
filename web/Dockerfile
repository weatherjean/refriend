# Frontend builder - copies built files to /dist
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Minimal image that just holds the built files
FROM alpine:latest
COPY --from=builder /app/dist /dist
# Copy files to shared volume on startup, then exit
CMD ["cp", "-r", "/dist/.", "/srv/web/"]
