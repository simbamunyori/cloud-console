# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# The Prisma CLI applies migrations at start-up. It gets its own complete
# install, because copying single packages out of node_modules misses
# their dependencies.
FROM base AS migrate
COPY package-lock.json ./
RUN npm install --no-save --omit=dev --prefix /migrate \
  "prisma@$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")"

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MEDIA_DIR=/app/media
RUN groupadd --system console && useradd --system --gid console console
# Images uploaded in the website editor; a volume in docker-compose.prod.yml.
RUN mkdir -p /app/media && chown console:console /app/media
COPY --from=build /app/public ./public
COPY --from=build --chown=console:console /app/.next/standalone ./
COPY --from=build --chown=console:console /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
# Legal pages are read from content/legal at run time.
COPY --from=build /app/content ./content
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=migrate /migrate/node_modules /migrate/node_modules
USER console
EXPOSE 3000
# Apply any pending migrations, then start. The website editor applies its own when the server starts.
CMD ["sh", "-c", "node /migrate/node_modules/prisma/build/index.js migrate deploy && node server.js"]
