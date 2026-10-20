# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
# better-sqlite3 can compile when no matching prebuilt binary is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts prisma-dev.config.ts ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/contracts/package.json ./packages/contracts/
# npm ci runs postinstall to generate both Prisma clients.
COPY scripts/generate-prisma.mjs ./scripts/
COPY apps/api/src/lib/environment.ts apps/api/src/lib/development-database.ts ./apps/api/src/lib/
COPY apps/api/src/paths.ts ./apps/api/src/
COPY prisma ./prisma
RUN HUSKY=0 npm ci
COPY . .
RUN npm run build \
    && mkdir -p apps/api/node_modules packages/core/node_modules packages/contracts/node_modules

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8783
# Keep the Prisma CLI and its dependencies for startup migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/prisma.config.ts ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Prisma's root TypeScript configuration imports these source-only helpers.
COPY --from=build /app/apps/api/src/paths.ts ./apps/api/src/
COPY --from=build /app/apps/api/src/lib/environment.ts ./apps/api/src/lib/
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/
COPY --from=build /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
USER node
EXPOSE 8783
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node apps/api/dist/server.js"]
