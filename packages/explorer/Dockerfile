# Static build of the encrypted-mempool explorer. The build context must be the
# REPO ROOT (the explorer depends on the bte-sdk workspace package), so on
# Railway set this service's root directory to the repo root and point it at
# this Dockerfile (packages/explorer/Dockerfile).
#
# The coordinator and relayer URLs are baked in at build time (Vite inlines
# them), so pass them as build args:
#   VITE_BTE_URL      the coordinator base URL (for /v0 sealing)
#   VITE_RELAYER_URL  the relayer base URL (sponsored swaps)
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY . .
RUN pnpm install --frozen-lockfile=false
ARG VITE_BTE_URL
ARG VITE_RELAYER_URL
ENV VITE_BTE_URL=$VITE_BTE_URL
ENV VITE_RELAYER_URL=$VITE_RELAYER_URL
RUN pnpm --filter bte-sdk build && pnpm --filter bte-explorer build

FROM node:22-slim AS serve
RUN npm i -g serve@14
COPY --from=build /repo/packages/explorer/dist /app/dist
ENV PORT=3000
EXPOSE 3000
# SPA fallback (-s) so hash routes resolve.
CMD serve -s /app/dist -l ${PORT}
