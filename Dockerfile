# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json

RUN pnpm install --frozen-lockfile

COPY . .

# Build shared workspace packages once so app builds can consume compiled outputs.
RUN pnpm --filter @openagents/shared run build \
  && pnpm --filter @openagents/sdk run build

FROM base AS api-build
RUN pnpm --filter @openagents/api run db:generate \
  && pnpm --filter @openagents/api run build

FROM node:20-bookworm-slim AS api-runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY --from=api-build /app /app

EXPOSE 3001

CMD ["sh", "-c", "(pnpm --filter @openagents/api exec prisma migrate deploy || pnpm --filter @openagents/api exec prisma db push) && node apps/api/dist/main.js"]

FROM base AS web-build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @openagents/web run build

FROM node:20-bookworm-slim AS web-runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY --from=web-build /app /app

EXPOSE 3000

CMD ["pnpm", "--filter", "@openagents/web", "run", "start"]

FROM base AS worker-build
RUN pnpm --filter @openagents/worker run build

FROM node:20-bookworm-slim AS worker-runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY --from=worker-build /app /app

CMD ["node", "apps/worker/dist/index.js"]
