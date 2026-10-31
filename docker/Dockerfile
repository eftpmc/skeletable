# The MCP server, with the tables built into the image: publishing a table is a deploy.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/tables/package.json packages/tables/
RUN pnpm install --frozen-lockfile --filter @skeleton/mcp...
COPY apps/mcp apps/mcp
COPY packages/tables packages/tables
RUN pnpm --filter @skeleton/mcp build
RUN pnpm deploy --legacy --filter @skeleton/mcp --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4200 \
    TABLES_DIR=/app/tables
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/mcp/dist ./dist
COPY tables ./tables
USER node
EXPOSE 4200
CMD ["node", "dist/index.js"]
