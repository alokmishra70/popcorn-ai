# syntax=docker/dockerfile:1.7
# One build, three runtime images:
#   docker build --target server .     API, worker and migrations
#   docker build --target dashboard .  Next.js dashboard (standalone output)

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@popcornai/api... --filter=@popcornai/dashboard...

FROM base AS server
ENV NODE_ENV=production
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 4100
CMD ["node", "apps/api/dist/main.js"]

FROM node:22-alpine AS dashboard
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 POPCORN_DOCS_DIR=/app/docs
COPY --from=build --chown=node:node /repo/apps/dashboard/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build --chown=node:node /repo/apps/dashboard/public ./apps/dashboard/public
COPY --from=build --chown=node:node /repo/docs ./docs
USER node
EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
