# Standalone image for the encrypted-mempool agents. One image runs any of the
# services; pick which with the START env var (relayer | searcher | settler |
# keeper). Deploy from THIS directory on Railway (set the service root to
# packages/mempool-agents) and create one service per agent, each with its own
# START and key.
FROM node:22-slim

WORKDIR /app

# Standalone package (viem + tsx only), so a plain npm install works with no
# monorepo/workspace context.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY deployments ./deployments

# Which agent to run. Override in Railway per service.
ENV START=relayer

# Shell form so ${START} expands. tsx runs the TypeScript directly.
CMD node --import tsx "src/${START}.ts"
