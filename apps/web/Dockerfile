# Next.js app as a standalone server (see output: 'standalone' in next.config.ts).
# Build from the repo root: docker compose --profile app up --build

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/sync/package.json apps/sync/
COPY packages/board/package.json packages/board/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN npm run build -w @teaching/web

FROM node:26-alpine AS run
WORKDIR /app
# The running app doesn't need npm (and its bundled packages only add known vulnerabilities).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=1000:1000 /app/apps/web/.next/standalone ./
COPY --from=build --chown=1000:1000 /app/apps/web/.next/static ./apps/web/.next/static
# Uploaded images live here (a volume in docker-compose.yml).
RUN mkdir -p apps/web/.data/assets && chown -R 1000:1000 apps/web/.data
USER 1000:1000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
