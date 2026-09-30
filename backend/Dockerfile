FROM node:26-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Europe/Moscow \
    NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca_bundle.pem
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./
COPY backend/seed ./seed
COPY infra/certs/russian_trusted_ca_bundle.pem ./certs/
USER node
CMD ["node", "dist/main.js", "api"]
