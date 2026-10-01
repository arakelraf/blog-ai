# Pipeline service — build + run. Native better-sqlite3 needs build toolchain.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app/pipeline

# Install deps (builds better-sqlite3 via onlyBuiltDependencies in package.json)
COPY pipeline/package.json ./
RUN pnpm install --no-frozen-lockfile

# Build
COPY pipeline/ ./
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]
