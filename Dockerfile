# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts ./
COPY src ./src
COPY public ./public
ARG VITE_API_URL=/api
ARG VITE_DELIVERY_MODE=full
RUN npm run build

FROM node:24-bookworm-slim AS backend-dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    SERVE_FRONTEND=true \
    TZ=America/Guatemala \
    MEDIA_STORAGE_PATH=/app/backend/storage/media
WORKDIR /app/backend
COPY --from=backend-dependencies --chown=node:node /app/backend ./
COPY --chown=node:node backend/src ./src
COPY --from=frontend --chown=node:node /app/dist /app/dist
RUN mkdir -p storage/media backups && chown -R node:node storage backups
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(5000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/server.js"]
