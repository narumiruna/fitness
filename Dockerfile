# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN HUSKY=0 npm ci
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
# Keep the Prisma CLI and its dependencies for startup migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.ts /app/prisma.config.ts ./
COPY --from=build /app/prisma ./prisma
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 8783
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 8783"]
