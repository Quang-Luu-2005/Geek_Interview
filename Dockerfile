FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM dependencies AS build
COPY tsconfig*.json nest-cli.json eslint.config.mjs prettier.config.cjs ./
COPY src ./src
COPY scripts ./scripts
COPY database ./database
COPY openapi ./openapi
RUN npm run prisma:generate && npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Prisma CLI is an optional peer of @prisma/client. Excluding optional packages
# keeps build tooling (and its advisory chain) out of the production image.
RUN npm ci --omit=dev --omit=optional --ignore-scripts \
    && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-tools ./dist-tools
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/database ./database
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/openapi ./openapi
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
