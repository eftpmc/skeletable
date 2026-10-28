# The hub: its API and MCP (the default command), or, run as `node dist/cli.js cycle`, the scheduled job
# that crawls, annotates and publishes the catalog. Needs HUB_DATABASE_URL.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/hub/package.json apps/hub/
COPY packages/formats/package.json packages/formats/
COPY packages/hub-db/package.json packages/hub-db/
COPY packages/readers/package.json packages/readers/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @skeleton/hub...
COPY apps/hub apps/hub
COPY packages/formats packages/formats
COPY packages/hub-db packages/hub-db
COPY packages/readers packages/readers
COPY packages/shared packages/shared
RUN pnpm --filter @skeleton/hub build
RUN pnpm deploy --legacy --filter @skeleton/hub --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4100 \
    HUB_MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/hub/dist ./dist
COPY --from=build /repo/packages/hub-db/migrations ./migrations
USER node
EXPOSE 4100
# A plain command, so a platform's start command (node dist/cli.js cycle) replaces it whole.
CMD ["node", "dist/cli.js", "serve"]
