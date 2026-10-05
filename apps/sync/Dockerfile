# Live-sync server (and database migrations). Build from the repo root:
#   docker build -f apps/sync/Dockerfile .

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/sync/package.json apps/sync/
COPY packages/board/package.json packages/board/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
# Production dependencies only: dev tools such as drizzle-kit stay out of the image.
RUN npm ci --ignore-scripts --omit=dev --workspace @teaching/sync --workspace @teaching/db --workspace @teaching/shared --include-workspace-root=false

FROM node:26-alpine
WORKDIR /app
# The app only needs `node`. Removing npm/npx/corepack drops their dependencies (and any
# vulnerabilities in them) from the image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# --chown: the runtime user must be able to read the files, whatever their permissions were on the build machine.
COPY --from=deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --chown=1000:1000 package.json ./
COPY --chown=1000:1000 packages/shared packages/shared
COPY --chown=1000:1000 packages/db packages/db
COPY --chown=1000:1000 apps/sync apps/sync
ENV NODE_ENV=production PORT=3001
USER 1000:1000
EXPOSE 3001
CMD ["node", "--import", "tsx", "apps/sync/src/server.ts"]
