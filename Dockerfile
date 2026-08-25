# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS package-base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.23.0 --activate
WORKDIR /workspace

FROM package-base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/test-config/package.json packages/test-config/package.json

FROM manifests AS build-dependencies
RUN pnpm install --frozen-lockfile

FROM build-dependencies AS build
COPY . .
RUN pnpm build

FROM manifests AS production-dependencies
RUN pnpm --filter @agent-workspace/api... \
    --filter @agent-workspace/worker... \
    install --prod --frozen-lockfile \
    && rm -rf apps/web packages/chat-core packages/test-config packages/ui

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="agent-workspace" \
      org.opencontainers.image.description="AW-007 multi-role scaffold runtime" \
      org.opencontainers.image.revision=$VCS_REF
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgnutls30 tini \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
    && rm -rf /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && groupadd --gid 10001 nodeapp \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin nodeapp
WORKDIR /app
COPY --from=production-dependencies /workspace/ ./
COPY --from=build /workspace/apps/api/dist/ ./apps/api/dist/
COPY --from=build /workspace/apps/worker/dist/ ./apps/worker/dist/
COPY --from=build /workspace/packages/config/dist/ ./packages/config/dist/
COPY --from=build /workspace/packages/contracts/dist/ ./packages/contracts/dist/
COPY --from=build /workspace/packages/db/dist/ ./packages/db/dist/
COPY --from=build /workspace/apps/web/.next/standalone/ ./web-standalone/
COPY --from=build /workspace/apps/web/.next/static/ ./web-standalone/apps/web/.next/static/
ENV NODE_ENV=production
USER 10001:10001
EXPOSE 3000 3001 3002
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
