import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();

const requiredRootFiles = [
  ".dependency-cruiser.cjs",
  ".dockerignore",
  ".editorconfig",
  ".env.example",
  ".github/workflows/ci.yml",
  ".gitignore",
  ".node-version",
  ".nvmrc",
  ".prettierignore",
  "Dockerfile",
  "LICENSE",
  "docker-compose.yml",
  "eslint.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "prettier.config.mjs",
  "tsconfig.base.json",
  "turbo.json",
  "docs/operations/container-image-lock.md",
];

const implementationFiles = [
  "apps/api/package.json",
  "apps/api/src/adapters/postgres/channel-event-journal.adapter.ts",
  "apps/api/src/app.module.ts",
  "apps/api/src/main.ts",
  "apps/api/src/platform/health.controller.ts",
  "apps/api/src/platform/health.service.ts",
  "apps/api/test/channel-event-journal.spec.ts",
  "apps/api/test/channel-event-journal.integration.spec.ts",
  "apps/api/test/health.spec.ts",
  "apps/api/tsconfig.json",
  "apps/api/vitest.config.ts",
  "apps/web/app/api/health/route.ts",
  "apps/web/app/globals.css",
  "apps/web/app/layout.tsx",
  "apps/web/app/page.tsx",
  "apps/web/next-env.d.ts",
  "apps/web/next.config.ts",
  "apps/web/package.json",
  "apps/web/test/fixtures/forbidden-db-import.ts",
  "apps/web/test/health.spec.ts",
  "apps/web/tsconfig.json",
  "apps/web/vitest.config.ts",
  "apps/worker/package.json",
  "apps/worker/src/health-server.ts",
  "apps/worker/src/main.ts",
  "apps/worker/src/storage-init.ts",
  "apps/worker/test/health.spec.ts",
  "apps/worker/test/storage-init.spec.ts",
  "apps/worker/tsconfig.json",
  "apps/worker/vitest.config.ts",
  "packages/chat-core/package.json",
  "packages/chat-core/src/index.ts",
  "packages/chat-core/src/modules/messaging/channel-event-journal.ts",
  "packages/chat-core/test/channel-event-journal.spec.ts",
  "packages/chat-core/test/fixtures/forbidden-db-import.ts",
  "packages/chat-core/test/public-api.spec.ts",
  "packages/chat-core/tsconfig.json",
  "packages/chat-core/vitest.config.ts",
  "packages/config/package.json",
  "packages/config/src/env.ts",
  "packages/config/test/env.spec.ts",
  "packages/config/tsconfig.json",
  "packages/contracts/generated/openapi-sync-v1.json",
  "packages/contracts/generated/sync-v1.schema.json",
  "packages/contracts/package.json",
  "packages/contracts/scripts/generate-artifacts.ts",
  "packages/contracts/src/artifacts.ts",
  "packages/contracts/src/events.ts",
  "packages/contracts/src/index.ts",
  "packages/contracts/src/primitives.ts",
  "packages/contracts/src/sync.ts",
  "packages/contracts/test/artifacts.spec.ts",
  "packages/contracts/test/events.spec.ts",
  "packages/contracts/test/primitives.spec.ts",
  "packages/contracts/test/sync.spec.ts",
  "packages/contracts/tsconfig.json",
  "packages/contracts/vitest.config.ts",
  "packages/db/drizzle.config.ts",
  "packages/db/drizzle/0000_aw008_foundation.sql",
  "packages/db/drizzle/0001_aw010a_channel_stream.sql",
  "packages/db/drizzle/meta/0000_snapshot.json",
  "packages/db/drizzle/meta/0001_snapshot.json",
  "packages/db/drizzle/meta/_journal.json",
  "packages/db/package.json",
  "packages/db/src/index.ts",
  "packages/db/src/migrate.ts",
  "packages/db/src/migration-config.ts",
  "packages/db/src/migration-env.ts",
  "packages/db/src/migration-integrity.ts",
  "packages/db/src/schema/channel-stream.ts",
  "packages/db/src/schema/enums.ts",
  "packages/db/src/schema/foundation.ts",
  "packages/db/src/schema/index.ts",
  "packages/db/test/channel-stream-migration.integration.spec.ts",
  "packages/db/test/channel-stream-migration.spec.ts",
  "packages/db/test/channel-stream-schema.spec.ts",
  "packages/db/test/constraints.integration.spec.ts",
  "packages/db/test/fixtures/failing-migration/0000_valid_then_fail.sql",
  "packages/db/test/fixtures/failing-migration/meta/_journal.json",
  "packages/db/test/migration.integration.spec.ts",
  "packages/db/test/migration.spec.ts",
  "packages/db/test/roles.integration.spec.ts",
  "packages/db/test/schema.spec.ts",
  "packages/db/test/support/postgres.ts",
  "packages/db/tsconfig.json",
  "packages/db/vitest.config.ts",
  "packages/test-config/package.json",
  "packages/test-config/src/vitest.ts",
  "packages/ui/package.json",
  "packages/ui/src/index.ts",
  "packages/ui/tsconfig.json",
  "scripts/assert-aw007-tree.mjs",
  "scripts/assert-boundary-fixture.mjs",
  "scripts/compose.sh",
  "scripts/container-smoke.sh",
  "scripts/postgres/init-roles.sh",
  "scripts/wait-for-url.mjs",
];

const workflowFiles = [".github/workflows/ci.yml"];

const packageNamesByManifest = new Map([
  ["apps/api/package.json", "@agent-workspace/api"],
  ["apps/web/package.json", "@agent-workspace/web"],
  ["apps/worker/package.json", "@agent-workspace/worker"],
  ["packages/chat-core/package.json", "@agent-workspace/chat-core"],
  ["packages/config/package.json", "@agent-workspace/config"],
  ["packages/contracts/package.json", "@agent-workspace/contracts"],
  ["packages/db/package.json", "@agent-workspace/db"],
  ["packages/test-config/package.json", "@agent-workspace/test-config"],
  ["packages/ui/package.json", "@agent-workspace/ui"],
]);

const canonicalRootScripts = {
  dev: "turbo run dev --parallel",
  build: "turbo run build",
  clean: "turbo run clean",
  format: "prettier --write .",
  "format:check": "prettier --check .",
  lint: "turbo run lint",
  typecheck: "turbo run typecheck",
  "boundaries:check":
    "depcruise --config .dependency-cruiser.cjs apps packages && node scripts/assert-boundary-fixture.mjs",
  "db:generate": "pnpm --filter @agent-workspace/db db:generate",
  "db:check":
    "pnpm --filter @agent-workspace/contracts contracts:check && pnpm --filter @agent-workspace/db db:check",
  "db:migrate": "pnpm --filter @agent-workspace/db db:migrate",
  "test:unit": "turbo run test:unit",
  "test:integration": "pnpm --filter @agent-workspace/db test:integration",
  "scaffold:check": "node scripts/assert-aw007-tree.mjs",
  "compose:up": "scripts/compose.sh up -d --build --wait",
  "compose:down": "scripts/compose.sh down --remove-orphans",
  "compose:reset": "scripts/compose.sh down --volumes --remove-orphans",
  "container:smoke": "scripts/container-smoke.sh",
  ci: "pnpm format:check && pnpm lint && pnpm typecheck && pnpm boundaries:check && pnpm test:unit && pnpm db:check && pnpm scaffold:check && pnpm build",
};

const canonicalApiScripts = {
  dev: "tsx watch src/main.ts",
  build: "tsc -p tsconfig.json",
  clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
  lint: "eslint src test vitest.config.ts",
  typecheck: "tsc -p tsconfig.json --noEmit",
  "test:unit": "vitest run --config vitest.config.ts --project unit",
  "test:integration":
    "vitest run --config vitest.config.ts --project integration --no-file-parallelism",
};

const canonicalChatCoreScripts = {
  build: "tsc -p tsconfig.json",
  clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
  lint: "eslint src test vitest.config.ts",
  typecheck: "tsc -p tsconfig.json --noEmit && pnpm run typecheck:test",
  "typecheck:test":
    "tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --useUnknownInCatchVariables --module NodeNext --moduleResolution NodeNext --target ES2023 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --forceConsistentCasingInFileNames --isolatedModules --skipLibCheck test/channel-event-journal.spec.ts test/public-api.spec.ts",
  "test:unit": "vitest run --config vitest.config.ts",
};

const canonicalContractsScripts = {
  build: "tsc -p tsconfig.json",
  clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
  "contracts:generate": "tsx scripts/generate-artifacts.ts",
  "contracts:check":
    "tsx scripts/generate-artifacts.ts --check && vitest run test/artifacts.spec.ts",
  lint: "eslint src test scripts vitest.config.ts",
  typecheck: "tsc -p tsconfig.json --noEmit",
  "test:unit": "vitest run test/primitives.spec.ts test/events.spec.ts test/sync.spec.ts",
};

const canonicalDbScripts = {
  build: "tsc -p tsconfig.json",
  clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
  "db:generate": "drizzle-kit generate --config drizzle.config.ts --name aw008_foundation",
  "db:check":
    "drizzle-kit check --config drizzle.config.ts && tsx src/migration-integrity.ts --check-files",
  "db:migrate": "tsx src/migrate.ts",
  lint: "eslint src test drizzle.config.ts vitest.config.ts",
  typecheck: "tsc -p tsconfig.json --noEmit",
  "test:unit":
    "vitest run test/schema.spec.ts test/migration.spec.ts test/channel-stream-schema.spec.ts test/channel-stream-migration.spec.ts",
  "test:integration":
    "vitest run --config vitest.config.ts --project integration --no-file-parallelism",
};

const exactDependenciesByManifest = new Map([
  [
    "apps/api/package.json",
    {
      dependencies: {
        "@agent-workspace/chat-core": "workspace:*",
        "@agent-workspace/config": "workspace:*",
        "@agent-workspace/contracts": "workspace:*",
        "@agent-workspace/db": "workspace:*",
        "@aws-sdk/client-s3": "3.1116.0",
        "@nestjs/common": "11.2.1",
        "@nestjs/core": "11.2.1",
        "@nestjs/platform-fastify": "11.2.1",
        fastify: "5.12.1",
        "reflect-metadata": "0.2.2",
        rxjs: "7.8.2",
        "socket.io": "4.8.3",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "apps/web/package.json",
    {
      dependencies: {
        "@agent-workspace/contracts": "workspace:*",
        "@agent-workspace/ui": "workspace:*",
        next: "16.3.2",
        react: "19.2.8",
        "react-dom": "19.2.8",
        "socket.io-client": "4.8.3",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        "@types/react": "19.2.18",
        "@types/react-dom": "19.2.5",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "apps/worker/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "@agent-workspace/contracts": "workspace:*",
        "@agent-workspace/db": "workspace:*",
        "@aws-sdk/client-s3": "3.1116.0",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "packages/chat-core/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "@agent-workspace/contracts": "workspace:*",
      },
      devDependencies: { typescript: "5.9.3", vitest: "4.1.11" },
    },
  ],
  [
    "packages/config/package.json",
    {
      dependencies: { zod: "4.4.3" },
      devDependencies: { typescript: "5.9.3", vitest: "4.1.11" },
    },
  ],
  [
    "packages/contracts/package.json",
    {
      dependencies: { zod: "4.4.3" },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        "fast-check": "4.9.0",
        tsx: "4.23.12",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "packages/db/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "drizzle-orm": "0.45.2",
        pg: "8.23.0",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        "@testcontainers/postgresql": "12.1.0",
        "@types/pg": "8.23.1",
        "drizzle-kit": "0.31.10",
        testcontainers: "12.1.0",
        tsx: "4.23.12",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "packages/test-config/package.json",
    {
      dependencies: {},
      devDependencies: { vitest: "4.1.11" },
    },
  ],
  [
    "packages/ui/package.json",
    {
      dependencies: { react: "19.2.8" },
      devDependencies: { "@types/react": "19.2.18", typescript: "5.9.3" },
    },
  ],
]);

const canonicalRootDevDependencies = {
  "@types/node": "24.13.3",
  "@typescript-eslint/eslint-plugin": "8.67.0",
  "@typescript-eslint/parser": "8.67.0",
  "@vitest/coverage-v8": "4.1.11",
  "dependency-cruiser": "18.2.0",
  "drizzle-kit": "0.31.10",
  eslint: "9.39.5",
  prettier: "3.9.6",
  tsx: "4.23.12",
  turbo: "2.10.11",
  typescript: "5.9.3",
  vitest: "4.1.11",
};

const canonicalWorkspacePolicy = `packages:
  - apps/*
  - packages/*
allowBuilds:
  "cpu-features@0.0.10": false
  esbuild: true
  "protobufjs@7.6.5": false
  "ssh2@1.17.0": false
minimumReleaseAgeExclude:
  - "@types/react-dom@19.2.5"
`;

const canonicalApiVitestConfig = `import { vitestUnitDefaults } from "@agent-workspace/test-config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...vitestUnitDefaults,
  test: {
    ...vitestUnitDefaults.test,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/health.spec.ts", "test/channel-event-journal.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/channel-event-journal.integration.spec.ts"],
          passWithNoTests: false,
          fileParallelism: false,
        },
      },
    ],
  },
});
`;

const canonicalChatCoreVitestConfig = `import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    globals: false,
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    include: ["test/channel-event-journal.spec.ts", "test/public-api.spec.ts"],
  },
});
`;

const canonicalDbVitestConfig = `import { vitestUnitDefaults } from "@agent-workspace/test-config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...vitestUnitDefaults,
  test: {
    ...vitestUnitDefaults.test,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.spec.ts"],
          exclude: ["test/**/*.integration.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          passWithNoTests: false,
          include: [
            "test/channel-stream-migration.integration.spec.ts",
            "test/constraints.integration.spec.ts",
            "test/migration.integration.spec.ts",
            "test/roles.integration.spec.ts",
          ],
          fileParallelism: false,
        },
      },
    ],
  },
});
`;

const canonicalChatCoreRootSource = `export type {
  TrustedChannelActor,
  ChannelEventIntent,
  AppendChannelEventInput,
  AppendChannelEventResult,
  ChannelEventTransaction,
} from "./modules/messaging/channel-event-journal.js";
`;

const exactAw010aS2FileHashes = new Map([
  [".dependency-cruiser.cjs", "fc2091620163f8b2cc5faec586ae7aadd02a79cb715ebff64bd0debc6ae08229"],
  [
    "apps/web/test/fixtures/forbidden-db-import.ts",
    "dd5fba1209189133176c24071fe2dee2c713189b61a5386d37a7ca399c7211f3",
  ],
  [
    "packages/chat-core/test/fixtures/forbidden-db-import.ts",
    "7a83ccc5f095fe2eabc29470c00146826f87027968c6bc22e5a85cfcebdf69ce",
  ],
  [
    "scripts/assert-boundary-fixture.mjs",
    "ba22342d0133de87523d8f0b2d818534d51206dbe0a52e17c373168efd80ab8f",
  ],
]);

const exactAw010aS3FileHashes = new Map([
  [
    "packages/db/src/schema/channel-stream.ts",
    "05c7179f0e07504899e04521261adf0ae293c0d3c024bd8fcdd8d17d948cd6dc",
  ],
  [
    "packages/db/src/schema/index.ts",
    "75c719e164c44937a93e4dca0ac3d8f504870f14c9d00c8c7ec0560d649da16c",
  ],
  [
    "packages/db/test/channel-stream-schema.spec.ts",
    "8cbc04fcc59c63c0068f4a26f9e3577be984084d0eceb1fde03c3bd6d7d235fd",
  ],
  ["packages/db/package.json", "56051b02f781a365848620759c116aa949e96aa61f9307b4f243006d894ae46b"],
  [
    "packages/db/test/schema.spec.ts",
    "df6b89171e6ba4e14adac4d76049865fffa3aa7974698387bda9e43de0779d45",
  ],
]);

const exactAw010aS4FileHashes = new Map([
  [
    "packages/db/drizzle/0001_aw010a_channel_stream.sql",
    "e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26",
  ],
  [
    "packages/db/drizzle/meta/0001_snapshot.json",
    "f118e261f89cd9e6d4faefa23c972c5bd4fc84dc5a14d9cca77cbf2b642751d2",
  ],
  [
    "packages/db/drizzle/meta/_journal.json",
    "70c038f3554c6b0e9eeb3bf429920d4a20c5cdfb7e6d2d02e43ccbbcc5520762",
  ],
  [
    "packages/db/src/migration-integrity.ts",
    "cf6a3bd233c5332b64fb86d2bf2f659201d2d3521444d578d8821f45feea195f",
  ],
  [
    "packages/db/test/channel-stream-migration.spec.ts",
    "598bc290b3834818c122e001fdabda949ff9f6e928d38a2b4179783ff062b581",
  ],
  [
    "packages/db/test/migration.spec.ts",
    "268564c471a114ec3b996fa9a5c4794bfce6d85733ff70e5cc5342517f247144",
  ],
]);

const exactAw010aS5FileHashes = new Map([
  [
    "packages/db/test/channel-stream-migration.integration.spec.ts",
    "5f88c2d92fdd3e9c0596e49ca98b7e087e5b812971249b2a1c3178c7a9956f83",
  ],
  [
    "packages/db/vitest.config.ts",
    "c0cdb380651169fb46da0d8d7bcca3a6ff492151276d1c0e91e6fb11d280ea13",
  ],
  [
    "packages/db/test/migration.integration.spec.ts",
    "3b4579c9ad02af7e3ebd6174c7d56216f229fd07e9cec9bf6124d08e6c5a118b",
  ],
  [
    "packages/db/test/constraints.integration.spec.ts",
    "9fd3cf86dd65d89e8f0d6467b888a1d79fc12d75b973ed53c039858979b0ac1c",
  ],
  [
    "packages/db/test/roles.integration.spec.ts",
    "e0952db6cda6e8f8bdd8ada597594f530b89966d19373c911d5193f2bc5d8009",
  ],
  [
    "packages/db/test/support/postgres.ts",
    "d9c4fdf3df45faaf0d1466463e6855a9482330a16a37896ada2ee4da19005452",
  ],
]);

const exactAw010aS5TestNames = [
  "AW010A-S5 registers exactly the four integration files in frozen order",
  "AW010A-S5 fails atomically when a 0000-only database contains pre-stream membership",
  "AW010A-S5 backfills exactly one zero sequence state for every existing channel",
  "AW010A-S5 observes channel DML blocking the migration ACCESS EXCLUSIVE lock until release",
  "AW010A-S5 observes membership DML blocking the migration ACCESS EXCLUSIVE lock until release",
  "AW010A-S5 initializes zero sequence state for a channel inserted after migration",
  "AW010A-S5 accepts a joined epoch backed by channel.member_joined",
  "AW010A-S5 accepts channel.member_left as an exited epoch event",
  "AW010A-S5 accepts channel.member_revoked as an exited epoch event",
  "AW010A-S5 accepts a nullable exited_event_seq for an active epoch",
  "AW010A-S5 rejects all six non-join event types for joined_event_seq",
  "AW010A-S5 rejects all five non-exit event types for exited_event_seq",
  "AW010A-S5 rejects a missing joined event through the immediate foreign key",
  "AW010A-S5 rejects an event reference from the wrong tenant",
  "AW010A-S5 rejects an event reference from another channel in the same tenant",
  "AW010A-S5 commits the supported event-first then membership transaction order",
  "AW010A-S5 rejects epoch-first ordering through the immediate event foreign key",
  "AW010A-S5 rolls back event epoch and sequence together on commit-time wrong-type failure",
  "AW010A-S5 leaves the exact two-row ledger on a no-op rerun",
  "AW010A-S5 serializes concurrent migrators with one advisory holder and one waiter",
  "AW010A-S5 preserves pre-AW010A application rollback over additive stream objects",
  "AW010A-S5 fails closed on isolated local migration hash drift",
  "AW010A-S5 freezes the exact live function trigger and FK deferrability catalog",
  "AW010A-S5 rejects synthetic positive markers and keeps typed errors free of fixture row data",
];

const exactAw010aS6FileHashes = new Map([
  [
    "apps/api/src/adapters/postgres/channel-event-journal.adapter.ts",
    "092efa73c505ca965d0383dd944ce11e1bb819b0019eeb30b062dc0fdf76b769",
  ],
  [
    "apps/api/test/channel-event-journal.spec.ts",
    "d061bf7d24fa9547ef944e1a6042cb8d0049f0aac480d3b764cf84dbdcdfd792",
  ],
  ["apps/api/package.json", "147ef9b89bf811b87a81cedea929a78d107723c8e769d3703e42690fb012b636"],
  ["pnpm-lock.yaml", "5bd040ec0beaf0533bd6289c48bb8a180890fe8240b3779398f3deeab6f6a226"],
]);

const exactAw010aS6TestNames = [
  "AW010A-S6 validates tenant-leading human and service actors with FOR SHARE",
  "AW010A-S6 rejects a missing same-tenant actor before generators or allocation",
  "AW010A-S6 rejects an actor kind mismatch before generators or allocation",
  "AW010A-S6 lets the allowlisted lifecycle system actor skip principal lookup",
  "AW010A-S6 rejects every non-allowlisted system actor before any query",
  "AW010A-S6 locks tenant-leading stream state with FOR UPDATE and text bigint",
  "AW010A-S6 fails closed when channel stream state is missing",
  "AW010A-S6 detects bigint-max exhaustion and rejects malformed locked state",
  "AW010A-S6 uses a guarded bigint update without lossy Number conversion",
  "AW010A-S6 re-reads only zero-row updates to map status and otherwise fails closed",
  "AW010A-S6 ignores forged envelope fields and calls each server generator exactly once",
  "AW010A-S6 rejects forged correlation, payload, ID, actor relation, or timestamp before allocation",
  "AW010A-S6 inserts exactly ten parameterized columns with explicit JSON payload",
  "AW010A-S6 rejects insert cardinality or identity mismatches and returns bigint identity",
  "AW010A-S6 keeps every custom error code and diagnostic fixed and row-free",
  "AW010A-S6 preserves actor-prevalidation-lock-update-insert order without transaction control",
];

const exactAw010aS7FileHashes = new Map([
  [
    "apps/api/test/channel-event-journal.integration.spec.ts",
    "844db833c25e327b8c617cdad7c4f46c828ed40f759cb15b35306ad9f5c08b6f",
  ],
  ["apps/api/vitest.config.ts", "ef19485759b1279fb8430ee36da7ff494e89cc00ee761ec8190eb3bc45fbf030"],
]);

const exactAw010aS7TestNames = [
  "AW010A-S7 commits and round-trips one canonical event through DurableEventV1",
  "AW010A-S7 allocates exact unique contiguous 1 through 4 for four same-channel commits",
  "AW010A-S7 allocates sequence 1 independently for concurrent different-channel commits",
  "AW010A-S7 caller rollback after successful append leaves sequence zero and no events",
  "AW010A-S7 duplicate event ID rolls back the attempted sequence allocation",
  "AW010A-S7 invalid envelope and payload fail before allocation with zero state change",
  "AW010A-S7 round-trips bigint beyond the JavaScript safe integer exactly",
  "AW010A-S7 allocates and commits bigint MAX from MAX minus one",
  "AW010A-S7 rejects exhausted bigint MAX without insert or state change",
  "AW010A-S7 commits exactly one bigint MAX winner for two MAX minus one contenders",
  "AW010A-S7 maps an existing channel with missing sequence state without writes",
  "AW010A-S7 rejects a channel that exists only in another tenant without cross-tenant writes",
  "AW010A-S7 rejects a cross-tenant human principal before allocation",
  "AW010A-S7 rejects a database principal kind mismatch before allocation",
  "AW010A-S7 accepts only the lifecycle system actor and rejects arbitrary system IDs before queries",
  "AW010A-S7 enforces event ID and tenant channel sequence uniqueness with exact catalog diagnostics",
  "AW010A-S7 rejects runtime journal UPDATE and DELETE while preserving the stored event",
  "AW010A-S7 runtime-role adapter append and select round-trip a human event",
  "AW010A-S7 runtime role cannot perform DDL or mutate the Drizzle ledger",
  "AW010A-S7 discloses runtime raw sequence-state UPDATE and DELETE access inside rollback",
];

const exactAw010aS7HarnessSemanticTokens = [
  'type Client = Awaited<ReturnType<PostgresTestHarness["connect"]>>;',
  "rowCount: result.rowCount ?? -1,",
  'const client = await activeHarness().connect("runtime");',
  'await client.query("BEGIN");',
  `await client.query("SET LOCAL statement_timeout = '10s'");`,
  `await client.query("SET LOCAL lock_timeout = '10s'");`,
  'await client.query("ROLLBACK");',
  "client.release();",
  "async function acquireRuntimeClients(count: number): Promise<readonly Client[]> {",
  "clients.push(await beginRuntimeClient());",
  "await rollbackAndReleaseAll(clients);",
  "async function rollbackAndReleaseAll(clients: readonly Client[]): Promise<void> {",
  "const settled = await Promise.allSettled(clients.map((client) => rollbackAndRelease(client)));",
  'throw new AggregateError(failures, "PostgreSQL runtime client cleanup failed");',
  '"PostgreSQL runtime client acquisition and cleanup failed"',
  "const promise = new Promise<Value>((resolvePromise, rejectPromise) => {",
  "return await Promise.race([operation, timeout]);",
  "clearTimeout(timer);",
  "harness = await startPostgresTestHarness();",
  "await testHarness.resetDatabase();",
  "await applyFrozenMigrations();",
  "const FROZEN_MIGRATIONS = [",
  'new URL("../../../packages/db/drizzle/0000_aw008_foundation.sql", import.meta.url)',
  'new URL("../../../packages/db/drizzle/0001_aw010a_channel_stream.sql", import.meta.url)',
  'const DRIZZLE_STATEMENT_BREAKPOINT = "--> statement-breakpoint";',
  'createHash("sha256").update(bytes).digest("hex") !== migration.hash',
  ".split(DRIZZLE_STATEMENT_BREAKPOINT)",
  'const client = await activeHarness().connect("migrator");',
  'await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");',
  "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations",
  "INSERT INTO drizzle.__drizzle_migrations (hash, created_at)",
  "[migration.hash, migration.createdAt]",
  "runId: testHarness.resources.runId,",
  "labels: Object.entries(testHarness.resources.labels).map(([key, value]) => `${key}=${value}`),",
  "testHarness.resources.ownerRole,",
  "testHarness.resources.migratorRole,",
  "testHarness.resources.runtimeRole,",
  "testHarness.connectionUrls.owner,",
  "testHarness.connectionUrls.migrator,",
  "testHarness.connectionUrls.runtime,",
  "const stats = await lstat(capture.evidencePath);",
  "!stats.isFile() || stats.isSymbolicLink()",
  "(stats.mode & 0o777) !== 0o600",
  "originalBytes = await readFile(capture.evidencePath);",
  "!originalBytes.equals(capture.expectedBytes)",
  'await writeFile(capture.evidencePath, Buffer.from("exclusive-create-probe", "utf8"), {',
  'flag: "wx",',
  "mode: 0o600,",
  'code !== "EEXIST"',
  "rereadBytes = await readFile(capture.evidencePath);",
  "!rereadBytes.equals(originalBytes)",
  "!rereadBytes.equals(capture.expectedBytes)",
  "const forbiddenValues = [...capture.roleNames, ...capture.connectionUrls];",
  "const leakedValueCount = forbiddenValues.filter((value) => text.includes(value)).length;",
  String.raw`/postgres(?:ql)?:\/\//giu,`,
  String.raw`/[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+(?::[^/\s@]*)?@/giu,`,
  String.raw`/["']?(?:password|passwd|pwd|secret|username|user)["']?\s*[:=]/giu,`,
  String.raw`/\b(?:DATABASE_URL|MIGRATION_DATABASE_URL)\b/gu,`,
  "const grammarMatchCount = credentialGrammar.reduce(",
  'const args = ["ps", "-a"];',
  'args.push("--filter", `label=${label}`);',
  'args.push("--format", "{{.ID}}");',
  'const { stdout } = await execFile("docker", args, { encoding: "utf8" });',
  "await testHarness.stop();",
  "const residue = await findResidualContainerIds(capture.resources.labels);",
  "if (residue.length !== 0)",
  'throw new AggregateError(failures, "PostgreSQL integration teardown failed");',
];

const exactAw010aS7SemanticTokensByTestName = new Map([
  [
    exactAw010aS7TestNames[0],
    [
      "return journal.append(appendInput(fixture));",
      "expect(result).toEqual({ eventSeq: 1n, eventId, occurredAt: OCCURRED_AT });",
      "expect(durableFromStored(rows[0]!)).toEqual(DurableEventV1.parse(expectedEvent));",
      "expect(rows[0]!.payload).toEqual(expectedEvent.payload);",
      'expect(await queryState(fixture)).toBe("1");',
      "expect(rows).toHaveLength(1);",
    ],
  ],
  [
    exactAw010aS7TestNames[1],
    [
      "const clients = await acquireRuntimeClients(4);",
      "const barrier = deferred<void>();",
      "await barrier.promise;",
      "barrier.resolve();",
      "const results = await withDeadline(Promise.all(operations));",
      "expect(rows.map(({ event_seq }) => BigInt(event_seq))).toEqual([1n, 2n, 3n, 4n]);",
      'expect(await queryState(fixture)).toBe("4");',
      "expect(rows).toHaveLength(4);",
    ],
  ],
  [
    exactAw010aS7TestNames[2],
    [
      "const second = await seedSecondChannel(first);",
      "const clients = await acquireRuntimeClients(fixtures.length);",
      "const barrier = deferred<void>();",
      "await barrier.promise;",
      "barrier.resolve();",
      "const results = await withDeadline(Promise.all(operations));",
      "expect(results[0]!.eventSeq).toBe(1n);",
      "expect(results[1]!.eventSeq).toBe(1n);",
      'expect((await queryEvents(fixture)).map(({ event_seq }) => event_seq)).toEqual(["1"]);',
    ],
  ],
  [
    exactAw010aS7TestNames[3],
    [
      "const result = await journal.append(appendInput(fixture));",
      "expect(result.eventSeq).toBe(1n);",
      'await client.query("ROLLBACK");',
      'expect(await queryState(fixture)).toBe("0");',
      "expect(await queryEvents(fixture)).toEqual([]);",
    ],
  ],
  [
    exactAw010aS7TestNames[4],
    [
      "eventId: duplicateEventId",
      'expect(error.code).toBe("23505");',
      'expect(error.constraint).toBe("channel_events_event_id_key");',
      'expect(await queryState(fixture)).toBe("1");',
      "expect(rows).toHaveLength(1);",
      'expect(rows[0]!.event_seq).toBe("1");',
    ],
  ],
  [
    exactAw010aS7TestNames[5],
    [
      'eventType: "message.updated",',
      'occurredAt: "2026-08-25T12:34:56.123456+00:00",',
      'expect((error as PostgresChannelEventJournalError).code).toBe("CHANNEL_EVENT_INVALID");',
      "expect(queryCount).toBe(0);",
      'expect(await queryState(fixture)).toBe("0");',
      "expect(await queryEvents(fixture)).toEqual([]);",
    ],
  ],
  [
    exactAw010aS7TestNames[6],
    [
      "await setSequence(fixture, BEYOND_SAFE_INTEGER);",
      "expect(result.eventSeq).toBe(9_007_199_254_740_993n);",
      'expect(typeof result.eventSeq).toBe("bigint");',
      "expect(await queryState(fixture)).toBe(BEYOND_SAFE_INTEGER_PLUS_ONE);",
      "expect(rows[0]!.event_seq).toBe(BEYOND_SAFE_INTEGER_PLUS_ONE);",
      "expect(durableFromStored(rows[0]!).event_seq).toBe(BEYOND_SAFE_INTEGER_PLUS_ONE);",
    ],
  ],
  [
    exactAw010aS7TestNames[7],
    [
      "await setSequence(fixture, MAX_PG_BIGINT_MINUS_ONE);",
      "expect(result.eventSeq).toBe(9_223_372_036_854_775_807n);",
      "expect(await queryState(fixture)).toBe(MAX_PG_BIGINT);",
      "expect(rows).toHaveLength(1);",
      "expect(rows[0]!.event_seq).toBe(MAX_PG_BIGINT);",
    ],
  ],
  [
    exactAw010aS7TestNames[8],
    [
      "await setSequence(fixture, MAX_PG_BIGINT);",
      'expect((error as PostgresChannelEventJournalError).code).toBe("CHANNEL_STREAM_EXHAUSTED");',
      "expect(await queryState(fixture)).toBe(MAX_PG_BIGINT);",
      "expect(await queryEvents(fixture)).toEqual([]);",
    ],
  ],
  [
    exactAw010aS7TestNames[9],
    [
      "await setSequence(fixture, MAX_PG_BIGINT_MINUS_ONE);",
      "const clients = await acquireRuntimeClients(2);",
      "const barrier = deferred<void>();",
      "barrier.resolve();",
      "settled = await withDeadline(Promise.allSettled(operations));",
      "expect(fulfilled).toHaveLength(1);",
      "expect(rejected).toHaveLength(1);",
      '"CHANNEL_STREAM_EXHAUSTED",',
      "expect(await queryState(fixture)).toBe(MAX_PG_BIGINT);",
      "expect(rows).toHaveLength(1);",
    ],
  ],
  [
    exactAw010aS7TestNames[10],
    [
      "const sentinel = await seedFixture();",
      "DELETE FROM public.channel_event_sequences",
      'code: "CHANNEL_STREAM_STATE_MISSING",',
      "expect(await queryState(target)).toBeUndefined();",
      "expect(await queryState(sentinel)).toBe(sentinelStateBefore);",
      "expect(await queryEvents(sentinel)).toEqual(sentinelEventsBefore);",
    ],
  ],
  [
    exactAw010aS7TestNames[11],
    [
      "const tenantAControl = await seedFixture();",
      "const tenantBChannel = await seedFixture();",
      "channelId: tenantBChannel.channelId,",
      'code: "CHANNEL_STREAM_STATE_MISSING",',
      "expect(await queryState(tenantAControl)).toBe(tenantAStateBefore);",
      "expect(await queryState(tenantBChannel)).toBe(tenantBStateBefore);",
      "expect(await queryEvents(tenantBChannel)).toEqual(tenantBEventsBefore);",
    ],
  ],
  [
    exactAw010aS7TestNames[12],
    [
      'const actor = trustedActor({ kind: "human", principalId: tenantB.principalId });',
      'code: "CHANNEL_ACTOR_NOT_FOUND",',
      "values: [target.tenantId, tenantB.principalId],",
      'expect(await queryState(target)).toBe("0");',
      "expect(await queryEvents(tenantB)).toEqual(tenantBEventsBefore);",
    ],
  ],
  [
    exactAw010aS7TestNames[13],
    [
      'const fixture = await seedFixture({ principalKind: "service" });',
      'const actor = trustedActor({ kind: "human", principalId: fixture.principalId });',
      'code: "CHANNEL_ACTOR_KIND_MISMATCH",',
      "values: [fixture.tenantId, fixture.principalId],",
      'expect(await queryState(fixture)).toBe("0");',
      "expect(await queryEvents(fixture)).toEqual([]);",
    ],
  ],
  [
    exactAw010aS7TestNames[14],
    [
      'actor_principal_id: "system:channel-lifecycle",',
      'principalId: "system:arbitrary-s7",',
      'code: "CHANNEL_ACTOR_INVALID",',
      "expect(queryCount).toBe(0);",
      "expect(generatorCalls).toBe(0);",
      "expect(clockCalls).toBe(0);",
      'expect(await queryState(fixture)).toBe("1");',
      "expect(await queryEvents(fixture)).toEqual(storedBefore);",
    ],
  ],
  [
    exactAw010aS7TestNames[15],
    [
      "FROM pg_catalog.pg_constraint AS constraint_record",
      'constraint_name: "channel_events_event_id_key",',
      'definition: "UNIQUE (event_id)",',
      'constraint_name: "channel_events_pkey",',
      'definition: "PRIMARY KEY (tenant_id, channel_id, event_seq)",',
      "INSERT INTO public.channel_events (",
      'expect(duplicateEventIdError.constraint).toBe("channel_events_event_id_key");',
      'expect(duplicateSequenceError.constraint).toBe("channel_events_pkey");',
      "expect(await queryEvents(fixture)).toEqual(seededRows);",
    ],
  ],
  [
    exactAw010aS7TestNames[16],
    [
      "UPDATE public.channel_events",
      "DELETE FROM public.channel_events",
      'expect(updateError.code).toBe("55000");',
      'expect(updateError.message).toBe("channel events are append-only");',
      'expect(deleteError.code).toBe("55000");',
      'expect(deleteError.message).toBe("channel events are append-only");',
      "expect(await queryEvents(fixture)).toEqual(storedBefore);",
    ],
  ],
  [
    exactAw010aS7TestNames[17],
    [
      'const actor = trustedActor({ kind: "human", principalId: fixture.principalId });',
      '"SELECT current_user"',
      "expect(identity.rows).toEqual([{ current_user: activeHarness().resources.runtimeRole }]);",
      "expect(result).toEqual({ eventSeq: 1n, eventId, occurredAt: OCCURRED_AT });",
      'await client.query("COMMIT");',
      "expect(durableFromStored(rows[0]!)).toEqual(DurableEventV1.parse(expectedEvent));",
      'actor_kind: "human",',
    ],
  ],
  [
    exactAw010aS7TestNames[18],
    [
      "pg_catalog.has_database_privilege",
      "pg_catalog.has_schema_privilege",
      "pg_catalog.has_table_privilege",
      "can_create_in_database: false, can_create_in_public: false",
      "can_insert: false,",
      "can_update: false,",
      "can_delete: false,",
      "can_truncate: false,",
      "CREATE TABLE public.${forbiddenTable}",
      "INSERT INTO drizzle.__drizzle_migrations",
      "UPDATE drizzle.__drizzle_migrations",
      "DELETE FROM drizzle.__drizzle_migrations",
      'expect(ddlError.code).toBe("42501");',
      "expect(ledgerAfter.rows).toEqual(ledgerBefore.rows);",
    ],
  ],
  [
    exactAw010aS7TestNames[19],
    [
      "'public.channel_event_sequences',",
      "can_update: true,",
      "can_delete: true,",
      "UPDATE public.channel_event_sequences",
      "DELETE FROM public.channel_event_sequences",
      "expect(updated.rowCount).toBe(1);",
      "expect(deleted.rowCount).toBe(1);",
      'last_event_seq: "7",',
      'expect(await queryState(first)).toBe("0");',
      'expect(await queryState(second)).toBe("0");',
      "expect(await queryEvents(first)).toEqual([]);",
      "expect(await queryEvents(second)).toEqual([]);",
    ],
  ],
]);

const exactAw010aS6SnapshotSemanticTokens = [
  "function reflectOrSnapshotError<Value>(",
  "function getOwnDataDescriptor(",
  "() => Object.getOwnPropertyDescriptor(record, key),",
  "function readActor(value: unknown): ActorSnapshot {",
  'reflectOrSnapshotError(() => Array.isArray(value), "CHANNEL_ACTOR_INVALID")',
  "() => Object.getPrototypeOf(value),",
  'reflectOrSnapshotError(() => Reflect.ownKeys(value), "CHANNEL_ACTOR_INVALID")',
  'const kind = getOwnDataDescriptor(value, "kind", "CHANNEL_ACTOR_INVALID");',
  'const principalId = getOwnDataDescriptor(value, "principalId", "CHANNEL_ACTOR_INVALID");',
  "function snapshotInput(input: unknown): InputSnapshot {",
  'const tenantId = getOwnDataDescriptor(input, "tenantId", "CHANNEL_EVENT_INVALID");',
  'const channelId = getOwnDataDescriptor(input, "channelId", "CHANNEL_EVENT_INVALID");',
  'const actorValue = getOwnDataDescriptor(input, "actor", "CHANNEL_ACTOR_INVALID");',
  'const intentValue = getOwnDataDescriptor(input, "intent", "CHANNEL_EVENT_INVALID");',
  "function snapshotIntent(value: unknown): IntentSnapshot {",
  "function snapshotPayloadArray(value: readonly unknown[], stack: Set<object>): unknown[] {",
  "function snapshotPayloadRecord(value: object, stack: Set<object>): object {",
  "function snapshotPayloadValue(value: unknown, stack: Set<object>): unknown {",
  'reflectOrSnapshotError(() => Array.isArray(value), "CHANNEL_EVENT_INVALID")',
  'reflectOrSnapshotError(() => Reflect.ownKeys(value), "CHANNEL_EVENT_INVALID")',
  "const snapshot = Object.create(null) as Record<PropertyKey, unknown>;",
  "Object.defineProperty(snapshot, key, {",
  "Number.isFinite(value)",
  "stack.add(value);",
  "stack.delete(value);",
  "const { eventType, payload } = input.intent;",
];

const exactAw010aS6AdversarialSemanticTokens = [
  "changingKindGetter",
  "changingPrincipalIdGetter",
  "throwingGetter",
  "ownKeysTrap",
  "descriptorTrap",
  "fixedErrorDescriptorTrap",
  "Object.assign(Object.create({ inherited: true }), actorData)",
  "extraAccessor",
  "ignoredEnvelopeGetter",
  "topLevelTenantGetter",
  "topLevelIntentGetter",
  "nestedPayloadGetter",
  "cyclicPayload",
  "payloadOwnKeysTrap",
  "payloadDescriptorTrap",
];

const exactAw010aS6ErrorCodes = [
  "CHANNEL_ACTOR_INVALID",
  "CHANNEL_ACTOR_NOT_FOUND",
  "CHANNEL_ACTOR_KIND_MISMATCH",
  "CHANNEL_EVENT_INVALID",
  "CHANNEL_STREAM_STATE_MISSING",
  "CHANNEL_STREAM_EXHAUSTED",
  "CHANNEL_STREAM_ALLOCATION_FAILED",
  "CHANNEL_EVENT_INSERT_FAILED",
];

const canonicalAw010aS6ActorSql = `SELECT principal_kind::text AS principal_kind
FROM public.principals
WHERE tenant_id = $1
  AND principal_id = $2
FOR SHARE`;

const canonicalAw010aS6StateSql = `SELECT last_event_seq::text AS last_event_seq
FROM public.channel_event_sequences
WHERE tenant_id = $1
  AND channel_id = $2
FOR UPDATE`;

const canonicalAw010aS6UpdateSql = `UPDATE public.channel_event_sequences
SET last_event_seq = last_event_seq + 1
WHERE tenant_id = $1
  AND channel_id = $2
  AND last_event_seq = $3::bigint
  AND last_event_seq < 9223372036854775807::bigint
RETURNING last_event_seq::text AS event_seq`;

const canonicalAw010aS6InsertSql = `INSERT INTO public.channel_events (
  tenant_id,
  channel_id,
  event_seq,
  event_id,
  schema_version,
  event_type,
  actor_principal_id,
  actor_kind,
  occurred_at,
  payload
)
VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10::jsonb)
RETURNING event_seq::text AS event_seq, event_id`;

const canonicalAw010aS6ApiLockfileImporter = `  apps/api:
    dependencies:
      "@agent-workspace/chat-core":
        specifier: workspace:*
        version: link:../../packages/chat-core
      "@agent-workspace/config":
        specifier: workspace:*
        version: link:../../packages/config
      "@agent-workspace/contracts":
        specifier: workspace:*
        version: link:../../packages/contracts
      "@agent-workspace/db":
        specifier: workspace:*
        version: link:../../packages/db
      "@aws-sdk/client-s3":
        specifier: 3.1116.0
        version: 3.1116.0
      "@nestjs/common":
        specifier: 11.2.1
        version: 11.2.1(reflect-metadata@0.2.2)(rxjs@7.8.2)(supports-color@7.2.0)
      "@nestjs/core":
        specifier: 11.2.1
        version: 11.2.1(@nestjs/common@11.2.1(reflect-metadata@0.2.2)(rxjs@7.8.2)(supports-color@7.2.0))(reflect-metadata@0.2.2)(rxjs@7.8.2)
      "@nestjs/platform-fastify":
        specifier: 11.2.1
        version: 11.2.1(@nestjs/common@11.2.1(reflect-metadata@0.2.2)(rxjs@7.8.2)(supports-color@7.2.0))(@nestjs/core@11.2.1(@nestjs/common@11.2.1(reflect-metadata@0.2.2)(rxjs@7.8.2)(supports-color@7.2.0))(reflect-metadata@0.2.2)(rxjs@7.8.2))
      fastify:
        specifier: 5.12.1
        version: 5.12.1
      reflect-metadata:
        specifier: 0.2.2
        version: 0.2.2
      rxjs:
        specifier: 7.8.2
        version: 7.8.2
      socket.io:
        specifier: 4.8.3
        version: 4.8.3(supports-color@7.2.0)
    devDependencies:
      "@agent-workspace/test-config":
        specifier: workspace:*
        version: link:../../packages/test-config
      typescript:
        specifier: 5.9.3
        version: 5.9.3
      vitest:
        specifier: 4.1.11
        version: 4.1.11(@types/node@24.13.3)(@vitest/coverage-v8@4.1.11)(vite@8.2.2(@types/node@24.13.3)(esbuild@0.28.2)(tsx@4.23.12)(yaml@2.9.0))

`;

const exactExistingIntegrationTestCounts = new Map([
  ["packages/db/test/constraints.integration.spec.ts", 10],
  ["packages/db/test/migration.integration.spec.ts", 5],
  ["packages/db/test/roles.integration.spec.ts", 10],
]);

const exactAw010aS5SemanticTokensByFile = new Map([
  [
    "packages/db/test/support/postgres.ts",
    [
      'import { CHANNEL_STREAM_MIGRATION_HASH } from "../../src/migration-integrity.js";',
      "migrationHash: CHANNEL_STREAM_MIGRATION_HASH,",
    ],
  ],
  [
    "packages/db/test/roles.integration.spec.ts",
    [
      "UPDATE public.channel_event_sequences\n          SET last_event_seq = $3",
      "await expectRuntimeAppendOnlyRejected(\n      `UPDATE public.channel_events",
      "await expectRuntimeAppendOnlyRejected(\n      `DELETE FROM public.channel_events",
    ],
  ],
  [
    "packages/db/test/constraints.integration.spec.ts",
    [
      `const PUBLIC_TABLES = [
  "channel_event_sequences",
  "channel_events",
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
] as const;`,
      "interface ChannelEventFixture {",
      "async function seedChannelEvents(",
      "INSERT INTO channel_events",
    ],
  ],
  [
    "packages/db/test/migration.integration.spec.ts",
    [
      "const CHANNEL_STREAM_CREATED_AT = 1_787_695_124_181;",
      `{
          id: 2,
          created_at: String(CHANNEL_STREAM_CREATED_AT),
          hash: CHANNEL_STREAM_MIGRATION_HASH,
        },`,
    ],
  ],
  [
    "packages/db/test/channel-stream-migration.integration.spec.ts",
    [
      "const sharedCrossTenantChannelId = FIXTURE.channelA;",
      "await seedChannel(client, FIXTURE.tenantB, FIXTURE.workspaceB, sharedCrossTenantChannelId);",
      `expect(crossTenantRows.rows.map(({ channel_id: channelId }) => channelId)).toEqual([
      sharedCrossTenantChannelId,
      sharedCrossTenantChannelId,
    ]);`,
      "const preAw010aApplicationSource = writePreAw010aApplicationFixture.toString();",
      String.raw`/\b(?:channel_events|channel_event_sequences|channel_membership_epochs)\b/u,`,
      `await withCommittedTransaction((client) =>
      writePreAw010aApplicationFixture(client, applicationFixture),
    );`,
      `state_count: 1,
        last_event_seq: "0",
        events: 0,`,
    ],
  ],
]);

const canonicalWorkflow = `name: CI

"on":
  pull_request:

permissions:
  contents: read

jobs:
  ci:
    name: Frozen uncached CI and integration
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09
      - name: Set up Node.js
        uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444
        with:
          node-version: 24.15.0
          package-manager-cache: false
      - name: Enable Corepack and pin pnpm
        run: |
          corepack enable
          corepack prepare pnpm@11.23.0 --activate
      - name: Install frozen dependencies
        run: CI=true pnpm install --frozen-lockfile
      - name: Run uncached CI
        run: TURBO_FORCE=true pnpm run ci
      - name: Run Testcontainers integration
        env:
          AW008D_TEST_EVIDENCE_DIRECTORY: \${{ github.workspace }}/artifacts/testcontainers
        run: pnpm test:integration
      - name: Upload Testcontainers evidence
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: aw008d-testcontainers-evidence
          path: artifacts/testcontainers/*.json
          if-no-files-found: error
`;

const exactMigrationTables = [
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
];

const exactChannelStreamMigrationTables = ["channel_event_sequences", "channel_events"];
const exactCumulativeMigrationSnapshotTables = [
  ...exactMigrationTables.map((tableName) => `public.${tableName}`),
  ...exactChannelStreamMigrationTables.map((tableName) => `public.${tableName}`),
];
const exactChannelStreamFunctionNames = [
  "initialize_channel_event_sequence",
  "reject_channel_event_mutation",
  "enforce_channel_membership_event_types",
];
const exactChannelStreamTriggerNames = [
  "channels_initialize_event_sequence",
  "channel_events_append_only_guard",
  "channel_membership_epochs_event_type_guard",
];
const exactMembershipEventForeignKeyNames = [
  "channel_membership_epochs_joined_event_fk",
  "channel_membership_epochs_exited_event_fk",
];
const exactMigrationSnapshotEnums = {
  "public.channel_kind_v1": {
    name: "channel_kind_v1",
    schema: "public",
    values: ["public", "private", "dm"],
  },
  "public.history_mode_v1": {
    name: "history_mode_v1",
    schema: "public",
    values: ["full", "since_join"],
  },
  "public.principal_kind_v1": {
    name: "principal_kind_v1",
    schema: "public",
    values: ["human", "service"],
  },
  "public.workspace_role_v1": {
    name: "workspace_role_v1",
    schema: "public",
    values: ["owner", "admin", "member", "guest"],
  },
};
const exactMigrationSnapshotIndexNamesByTable = new Map([
  [
    "public.channel_membership_epochs",
    [
      "channel_membership_epochs_one_active_uq",
      "channel_membership_epochs_principal_idx",
      "channel_membership_epochs_channel_seq_idx",
    ],
  ],
  ["public.channels", ["channels_workspace_idx"]],
  ["public.principals", []],
  ["public.tenants", []],
  ["public.workspace_memberships", ["workspace_memberships_principal_idx"]],
  ["public.workspaces", []],
  ["public.channel_event_sequences", []],
  ["public.channel_events", []],
]);

const ignoredDirectoryNames = new Set([".next", ".turbo", "coverage", "dist", "node_modules"]);
const forbiddenTestMarker =
  /\b(?:describe|suite|it|test)(?:\s*\.\s*(?:concurrent|sequential))?\s*\.\s*(?:only|runIf|skip|skipIf|todo)\b|\b(?:runIf|skipIf)\s*\(/u;

function normalizedPath(path) {
  return path.split(sep).join("/");
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedObject(value[key])]),
  );
}

function assertExactObject(label, actual, expected) {
  if (JSON.stringify(sortedObject(actual)) !== JSON.stringify(sortedObject(expected))) {
    throw new Error(`${label} does not match the AW-008 frozen manifest`);
  }
}

function assertExactList(label, actual, expected) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  const actualSet = new Set(sortedActual);
  const expectedSet = new Set(sortedExpected);
  const missing = sortedExpected.filter((item) => !actualSet.has(item));
  const extra = sortedActual.filter((item) => !expectedSet.has(item));
  if (sortedActual.length !== sortedExpected.length || missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} does not match the AW-008 manifest; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
  }
}

function assertExactOrderedList(label, actual, expected) {
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(
      `${label} does not match the AW-008 ordered manifest; actual: ${actual.join(", ") || "none"}; expected: ${expected.join(", ") || "none"}`,
    );
  }
}

function literalItTestNames(path, source) {
  const allItCalls = source.match(/\bit\s*\(/gu) ?? [];
  const literalNames = [...source.matchAll(/\bit\s*\(\s*("(?:[^"\\]|\\.)*")/gu)].map((match) =>
    JSON.parse(match[1]),
  );
  if (literalNames.length !== allItCalls.length) {
    throw new Error(`${path} must use only direct it calls with literal double-quoted names`);
  }
  return literalNames;
}

function assertSourceIncludesAll(label, source, expectedTokens) {
  const missingTokens = expectedTokens.filter((token) => !source.includes(token));
  if (missingTokens.length > 0) {
    throw new Error(`${label} is missing exact semantic evidence: ${missingTokens.join(", ")}`);
  }
}

function exactConstTemplateLiteral(path, source, name) {
  const marker = `const ${name} = \``;
  const start = source.indexOf(marker);
  if (start === -1 || source.indexOf(marker, start + marker.length) !== -1) {
    throw new Error(`${path} must define exactly one ${name} template literal`);
  }
  const valueStart = start + marker.length;
  const valueEnd = source.indexOf("`;", valueStart);
  if (valueEnd === -1) {
    throw new Error(`${path} has an unterminated ${name} template literal`);
  }
  return source.slice(valueStart, valueEnd);
}

function normalizedSqlStatement(statement) {
  return statement.replaceAll('"', "").replace(/\s+/gu, " ").trim().toLowerCase();
}

async function assertRealFile(path) {
  let details;
  try {
    details = await lstat(resolve(root, path));
  } catch {
    throw new Error(`AW-008 required file is missing: ${path}`);
  }
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new Error(`AW-008 required file must be a real regular file: ${path}`);
  }
}

async function assertRealDirectory(path) {
  let details;
  try {
    details = await lstat(resolve(root, path));
  } catch {
    throw new Error(`AW-008 required directory is missing: ${path}`);
  }
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error(`AW-008 required directory must be a real directory: ${path}`);
  }
}

async function collectExactTree(directory, files, directories) {
  await assertRealDirectory(directory);
  directories.push(directory);
  const entries = await readdir(resolve(root, directory));
  for (const entry of entries) {
    const repositoryPath = normalizedPath(join(directory, entry));
    const details = await lstat(resolve(root, repositoryPath));
    if (details.isSymbolicLink()) {
      throw new Error(`Symlink is forbidden in the AW-008 implementation tree: ${repositoryPath}`);
    }
    if (details.isDirectory()) {
      if (ignoredDirectoryNames.has(entry)) continue;
      await collectExactTree(repositoryPath, files, directories);
    } else if (details.isFile()) {
      if (entry.endsWith(".tsbuildinfo")) continue;
      files.push(repositoryPath);
    } else {
      throw new Error(
        `Non-regular AW-008 implementation tree entry is forbidden: ${repositoryPath}`,
      );
    }
  }
}

function expectedDirectoriesFor(files, roots) {
  const expected = new Set(roots);
  for (const file of files) {
    let directory = normalizedPath(dirname(file));
    while (directory !== ".") {
      expected.add(directory);
      directory = normalizedPath(dirname(directory));
    }
  }
  return [...expected];
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

for (const path of requiredRootFiles) await assertRealFile(path);

const implementationRoots = ["apps", "packages", "scripts"];
const actualImplementationFiles = [];
const actualImplementationDirectories = [];
for (const directory of implementationRoots) {
  await collectExactTree(directory, actualImplementationFiles, actualImplementationDirectories);
}
assertExactList("Implementation files", actualImplementationFiles, implementationFiles);
assertExactList(
  "Implementation directories",
  actualImplementationDirectories,
  expectedDirectoriesFor(implementationFiles, implementationRoots),
);

const actualWorkflowFiles = [];
const actualWorkflowDirectories = [];
await collectExactTree(".github", actualWorkflowFiles, actualWorkflowDirectories);
assertExactList("Workflow files", actualWorkflowFiles, workflowFiles);
assertExactList(
  "Workflow directories",
  actualWorkflowDirectories,
  expectedDirectoriesFor(workflowFiles, [".github"]),
);

const actualPackageNames = [];
for (const [manifest, expectedName] of packageNamesByManifest) {
  const packageJson = await readJson(manifest);
  if (packageJson.name !== expectedName) {
    throw new Error(`${manifest} must be named ${expectedName}`);
  }
  actualPackageNames.push(packageJson.name);
  const expectedDependencies = exactDependenciesByManifest.get(manifest);
  assertExactObject(
    `${manifest} dependencies`,
    packageJson.dependencies ?? {},
    expectedDependencies.dependencies,
  );
  assertExactObject(
    `${manifest} devDependencies`,
    packageJson.devDependencies ?? {},
    expectedDependencies.devDependencies,
  );
  for (const field of [
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ]) {
    if (packageJson[field] !== undefined) {
      throw new Error(`${manifest} must not define ${field} in AW-008`);
    }
  }
}
assertExactList("Workspace package names", actualPackageNames, [
  ...packageNamesByManifest.values(),
]);

const rootPackage = await readJson("package.json");
if (rootPackage.license !== "Apache-2.0") {
  throw new Error("Root package license must equal Apache-2.0");
}
if (rootPackage.packageManager !== "pnpm@11.23.0") {
  throw new Error("Root packageManager must equal pnpm@11.23.0");
}
assertExactObject("Root engines", rootPackage.engines, {
  node: "24.15.0",
  pnpm: "11.23.0",
});
assertExactObject("Root scripts", rootPackage.scripts ?? {}, canonicalRootScripts);
assertExactObject("Root dependencies", rootPackage.dependencies ?? {}, {});
assertExactObject(
  "Root devDependencies",
  rootPackage.devDependencies ?? {},
  canonicalRootDevDependencies,
);
for (const field of [
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies",
  "bundleDependencies",
]) {
  if (rootPackage[field] !== undefined) {
    throw new Error(`Root package must not define ${field} in AW-008`);
  }
}

const apiPackage = await readJson("apps/api/package.json");
assertExactObject("API package scripts", apiPackage.scripts ?? {}, canonicalApiScripts);

const chatCorePackage = await readJson("packages/chat-core/package.json");
assertExactObject(
  "Chat-core package scripts",
  chatCorePackage.scripts ?? {},
  canonicalChatCoreScripts,
);
assertExactObject("Chat-core public exports", chatCorePackage.exports, {
  ".": { types: "./src/index.ts", import: "./dist/index.js" },
});

const chatCoreRootSource = await readFile(resolve(root, "packages/chat-core/src/index.ts"), "utf8");
if (chatCoreRootSource !== canonicalChatCoreRootSource) {
  throw new Error("Chat-core root source does not match the AW-010A S2 exact type export oracle");
}

const contractsPackage = await readJson("packages/contracts/package.json");
assertExactObject(
  "Contracts package scripts",
  contractsPackage.scripts ?? {},
  canonicalContractsScripts,
);
assertExactObject("Contracts public exports", contractsPackage.exports, {
  ".": { types: "./src/index.ts", import: "./dist/index.js" },
});

const dbPackage = await readJson("packages/db/package.json");
assertExactObject("DB package scripts", dbPackage.scripts ?? {}, canonicalDbScripts);
assertExactObject("DB public exports", dbPackage.exports, {
  ".": { types: "./src/index.ts", import: "./dist/index.js" },
});

const chatCoreVitestConfig = await readFile(
  resolve(root, "packages/chat-core/vitest.config.ts"),
  "utf8",
);
if (chatCoreVitestConfig !== canonicalChatCoreVitestConfig) {
  throw new Error("Chat-core Vitest config does not match the AW-010A S2 exact oracle");
}

for (const [path, expectedHash] of exactAw010aS2FileHashes) {
  const source = await readFile(resolve(root, path));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${path} does not match the AW-010A S2 byte-exact oracle`);
  }
}

for (const [path, expectedHash] of exactAw010aS3FileHashes) {
  const source = await readFile(resolve(root, path));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${path} does not match the AW-010A S3 byte-exact oracle`);
  }
}

for (const [path, expectedHash] of exactAw010aS4FileHashes) {
  const source = await readFile(resolve(root, path));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${path} does not match the AW-010A S4 byte-exact oracle`);
  }
}

const aw010aS5SourceByPath = new Map();
for (const [path, expectedHash] of exactAw010aS5FileHashes) {
  const source = await readFile(resolve(root, path));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${path} does not match the AW-010A S5 byte-exact oracle`);
  }
  aw010aS5SourceByPath.set(path, source.toString("utf8"));
}

const dbVitestConfig = aw010aS5SourceByPath.get("packages/db/vitest.config.ts");
if (dbVitestConfig !== canonicalDbVitestConfig) {
  throw new Error(
    "DB Vitest config does not preserve the exact independent AW-010A S5 unit and integration semantics",
  );
}

for (const [path, expectedTokens] of exactAw010aS5SemanticTokensByFile) {
  const source = aw010aS5SourceByPath.get(path);
  if (source === undefined) throw new Error(`AW-010A S5 semantic source is missing: ${path}`);
  assertSourceIncludesAll(path, source, expectedTokens);
}

const aw010aS5TestPath = "packages/db/test/channel-stream-migration.integration.spec.ts";
const aw010aS5TestSource = aw010aS5SourceByPath.get(aw010aS5TestPath);
if (aw010aS5TestSource === undefined) {
  throw new Error(`AW-010A S5 test source is missing: ${aw010aS5TestPath}`);
}
const aw010aS5TestNames = literalItTestNames(aw010aS5TestPath, aw010aS5TestSource);
if (
  aw010aS5TestNames.length !== 24 ||
  new Set(aw010aS5TestNames).size !== 24 ||
  aw010aS5TestNames.some((name) => !name.startsWith("AW010A-S5 "))
) {
  throw new Error("AW-010A S5 integration inventory must contain 24 unique prefixed it tests");
}
assertExactOrderedList(
  "AW-010A S5 integration test names",
  aw010aS5TestNames,
  exactAw010aS5TestNames,
);

let cumulativeIntegrationTestCount = aw010aS5TestNames.length;
for (const [path, expectedCount] of exactExistingIntegrationTestCounts) {
  const source = aw010aS5SourceByPath.get(path);
  if (source === undefined) throw new Error(`AW-010A S5 integration source is missing: ${path}`);
  const testNames = literalItTestNames(path, source);
  if (testNames.length !== expectedCount || new Set(testNames).size !== expectedCount) {
    throw new Error(`${path} must preserve exactly ${expectedCount} unique integration tests`);
  }
  cumulativeIntegrationTestCount += testNames.length;
}
if (cumulativeIntegrationTestCount !== 49) {
  throw new Error("AW-010A S5 cumulative integration inventory must contain exactly 49 tests");
}

const aw010aS6SourceByPath = new Map();
for (const [path, expectedHash] of exactAw010aS6FileHashes) {
  const source = await readFile(resolve(root, path));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${path} does not match the AW-010A S6 byte-exact oracle`);
  }
  aw010aS6SourceByPath.set(path, source.toString("utf8"));
}

const aw010aS6TestPath = "apps/api/test/channel-event-journal.spec.ts";
const aw010aS6TestSource = aw010aS6SourceByPath.get(aw010aS6TestPath);
if (aw010aS6TestSource === undefined) {
  throw new Error(`AW-010A S6 test source is missing: ${aw010aS6TestPath}`);
}
const aw010aS6TestNames = literalItTestNames(aw010aS6TestPath, aw010aS6TestSource);
if (
  aw010aS6TestNames.length !== 16 ||
  new Set(aw010aS6TestNames).size !== 16 ||
  aw010aS6TestNames.some((name) => !name.startsWith("AW010A-S6 "))
) {
  throw new Error("AW-010A S6 unit inventory must contain 16 unique prefixed it tests");
}
assertExactOrderedList("AW-010A S6 unit test names", aw010aS6TestNames, exactAw010aS6TestNames);
assertSourceIncludesAll(
  "AW-010A S6 adversarial tests",
  aw010aS6TestSource,
  exactAw010aS6AdversarialSemanticTokens,
);

const aw010aS6AdapterPath = "apps/api/src/adapters/postgres/channel-event-journal.adapter.ts";
const aw010aS6AdapterSource = aw010aS6SourceByPath.get(aw010aS6AdapterPath);
if (aw010aS6AdapterSource === undefined) {
  throw new Error(`AW-010A S6 adapter source is missing: ${aw010aS6AdapterPath}`);
}
assertSourceIncludesAll(
  "AW-010A S6 own-data snapshot adapter",
  aw010aS6AdapterSource,
  exactAw010aS6SnapshotSemanticTokens,
);
if (
  /\b(?:WeakSet|journalErrors|isJournalError|rethrowSnapshotError)\b/u.test(aw010aS6AdapterSource)
) {
  throw new Error(
    "AW-010A S6 hostile reflection must normalize directly to the boundary error code",
  );
}

const aw010aS6ExportLines = aw010aS6AdapterSource.match(/^\s*export\b.*$/gmu) ?? [];
const aw010aS6ExportDeclarations = [
  ...aw010aS6AdapterSource.matchAll(
    /^\s*export\s+(interface|class|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gmu,
  ),
].map((match) => `${match[1]} ${match[2]}`);
if (aw010aS6ExportLines.length !== aw010aS6ExportDeclarations.length) {
  throw new Error(
    "AW-010A S6 adapter must not expose re-exports, default exports, or extra surface",
  );
}
assertExactOrderedList("AW-010A S6 adapter exports", aw010aS6ExportDeclarations, [
  "interface ChannelEventJournalTransactionClient",
  "class PostgresChannelEventJournalError",
  "function createPostgresChannelEventTransaction",
]);

const aw010aS6ImportLines = aw010aS6AdapterSource.match(/^import\b.*$/gmu) ?? [];
assertExactOrderedList("AW-010A S6 adapter imports", aw010aS6ImportLines, [
  'import type { ChannelEventTransaction } from "@agent-workspace/chat-core";',
  'import { DurableEventV1 } from "@agent-workspace/contracts";',
]);
const aw010aS6ImportSpecifiers = [
  ...aw010aS6AdapterSource.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)["']([^"']+)["']/gu),
].map((match) => match[1]);
assertExactOrderedList("AW-010A S6 adapter module specifiers", aw010aS6ImportSpecifiers, [
  "@agent-workspace/chat-core",
  "@agent-workspace/contracts",
]);
const forbiddenAw010aS6AdapterImport = aw010aS6ImportSpecifiers.find((specifier) =>
  ["pg", "@types/pg", "@agent-workspace/db"].includes(specifier),
);
if (forbiddenAw010aS6AdapterImport !== undefined) {
  throw new Error(
    `AW-010A S6 adapter has a forbidden database import: ${forbiddenAw010aS6AdapterImport}`,
  );
}

for (const [name, expectedSql] of [
  ["ACTOR_SQL", canonicalAw010aS6ActorSql],
  ["STATE_SQL", canonicalAw010aS6StateSql],
  ["UPDATE_SQL", canonicalAw010aS6UpdateSql],
  ["INSERT_SQL", canonicalAw010aS6InsertSql],
]) {
  const actualSql = exactConstTemplateLiteral(aw010aS6AdapterPath, aw010aS6AdapterSource, name);
  if (actualSql !== expectedSql) {
    throw new Error(
      `${aw010aS6AdapterPath} ${name} does not match the AW-010A S6 exact SQL oracle`,
    );
  }
}

const aw010aS6ErrorCodeType = aw010aS6AdapterSource.match(
  /type ChannelEventJournalErrorCode\s*=([\s\S]*?);/u,
);
if (aw010aS6ErrorCodeType === null) {
  throw new Error("AW-010A S6 adapter must preserve the exact error-code type");
}
const aw010aS6TypedErrorCodes = [
  ...aw010aS6ErrorCodeType[1].matchAll(/\|\s+"(CHANNEL_[A-Z_]+)"/gu),
].map((match) => match[1]);
assertExactOrderedList(
  "AW-010A S6 typed error codes",
  aw010aS6TypedErrorCodes,
  exactAw010aS6ErrorCodes,
);
const aw010aS6LiteralErrorCodes = [
  ...new Set([...aw010aS6AdapterSource.matchAll(/"(CHANNEL_[A-Z_]+)"/gu)].map((match) => match[1])),
];
if (aw010aS6LiteralErrorCodes.length !== 8) {
  throw new Error("AW-010A S6 adapter must contain exactly eight distinct error-code literals");
}
assertExactList(
  "AW-010A S6 literal error codes",
  aw010aS6LiteralErrorCodes,
  exactAw010aS6ErrorCodes,
);

for (const [generatorName, pattern] of [
  ["generateEventId", /\bgenerateEventId\s*\(\s*\)/gu],
  ["clock", /\bclock\s*\(\s*\)/gu],
]) {
  if ((aw010aS6AdapterSource.match(pattern) ?? []).length !== 1) {
    throw new Error(`AW-010A S6 adapter must call ${generatorName} exactly once`);
  }
}
const aw010aS6AppendFlowTokens = [
  "const snapshot = snapshotInput(input);",
  "await validateActor(transaction, snapshot);",
  "const eventId = generateEventId();",
  "const occurredAt = clock();",
  "const dummyEvent = prevalidateEvent(snapshot, eventId, occurredAt);",
  "const sequence = await allocateSequence(",
  "const event = withActualSequence(dummyEvent, sequence.text);",
  "const returnedEventId = await insertEvent(transaction, event);",
];
let previousAw010aS6FlowIndex = -1;
for (const token of aw010aS6AppendFlowTokens) {
  const index = aw010aS6AdapterSource.indexOf(token, previousAw010aS6FlowIndex + 1);
  if (index === -1) {
    throw new Error(`AW-010A S6 adapter has invalid append ordering at: ${token}`);
  }
  previousAw010aS6FlowIndex = index;
}
if (/\.\.\.\s*(?:input|snapshot|intent)\b/u.test(aw010aS6AdapterSource)) {
  throw new Error("AW-010A S6 adapter must not spread caller-controlled input into an event");
}
if (/\b(?:BEGIN|COMMIT|ROLLBACK)\b/iu.test(aw010aS6AdapterSource)) {
  throw new Error("AW-010A S6 adapter must not issue transaction-control SQL");
}
if (/\bcontroller\b/iu.test(aw010aS6AdapterSource)) {
  throw new Error("AW-010A S6 adapter must not add controller surface");
}

const aw010aS6LockSource = aw010aS6SourceByPath.get("pnpm-lock.yaml");
if (aw010aS6LockSource === undefined) {
  throw new Error("AW-010A S6 lockfile source is missing");
}
const aw010aS6ApiImporterMatches = [
  ...aw010aS6LockSource.matchAll(/^  apps\/api:\n[\s\S]*?(?=^  apps\/web:\n)/gmu),
];
if (
  aw010aS6ApiImporterMatches.length !== 1 ||
  aw010aS6ApiImporterMatches[0][0] !== canonicalAw010aS6ApiLockfileImporter
) {
  throw new Error("pnpm-lock.yaml apps/api importer does not match the AW-010A S6 exact oracle");
}
if (/(?:^|\n)\s+(?:"?pg"?|"?@types\/pg"?):/u.test(aw010aS6ApiImporterMatches[0][0])) {
  throw new Error("pnpm-lock.yaml apps/api importer must not add pg or @types/pg");
}

const aw010aS7SourceByPath = new Map();
for (const [path, expectedHash] of exactAw010aS7FileHashes) {
  const source = await readFile(resolve(root, path));
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`${path} does not match the AW-010A S7 byte-exact oracle`);
  }
  aw010aS7SourceByPath.set(path, source.toString("utf8"));
}

const apiVitestConfig = aw010aS7SourceByPath.get("apps/api/vitest.config.ts");
if (apiVitestConfig !== canonicalApiVitestConfig) {
  throw new Error(
    "API Vitest config does not match the cumulative AW-010A S7 exact unit and integration oracle",
  );
}
if (
  (apiVitestConfig.match(/\bprojects\s*:/gu) ?? []).length !== 1 ||
  (apiVitestConfig.match(/\bextends\s*:\s*true\b/gu) ?? []).length !== 2 ||
  (apiVitestConfig.match(/\bname\s*:\s*"unit"/gu) ?? []).length !== 1 ||
  (apiVitestConfig.match(/\bname\s*:\s*"integration"/gu) ?? []).length !== 1 ||
  (apiVitestConfig.match(/\binclude\s*:/gu) ?? []).length !== 2 ||
  apiVitestConfig.includes("**")
) {
  throw new Error(
    "API Vitest config must preserve exactly the S6 unit project and one literal S7 integration project",
  );
}

const aw010aS7TestPath = "apps/api/test/channel-event-journal.integration.spec.ts";
const aw010aS7TestSource = aw010aS7SourceByPath.get(aw010aS7TestPath);
if (aw010aS7TestSource === undefined) {
  throw new Error(`AW-010A S7 test source is missing: ${aw010aS7TestPath}`);
}
const aw010aS7TestNames = literalItTestNames(aw010aS7TestPath, aw010aS7TestSource);
if (
  aw010aS7TestNames.length !== 20 ||
  new Set(aw010aS7TestNames).size !== 20 ||
  aw010aS7TestNames.some((name) => !name.startsWith("AW010A-S7 "))
) {
  throw new Error("AW-010A S7 integration inventory must contain 20 unique prefixed it tests");
}
assertExactOrderedList(
  "AW-010A S7 integration test names",
  aw010aS7TestNames,
  exactAw010aS7TestNames,
);
if (
  (aw010aS7TestSource.match(/\bdescribe\s*\(/gu) ?? []).length !== 1 ||
  !aw010aS7TestSource.includes(
    'describe("AW010A-S7 real PostgreSQL channel event journal", () => {',
  ) ||
  /\b(?:describe|suite|it|test)\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*\b/u.test(aw010aS7TestSource) ||
  /\b(?:suite|test|runIf|skipIf)\s*\(/u.test(aw010aS7TestSource)
) {
  throw new Error(
    "AW-010A S7 tests must use only one direct describe and 20 direct literal it registrations",
  );
}

assertSourceIncludesAll(
  "AW-010A S7 harness, transaction, evidence, and teardown contract",
  aw010aS7TestSource,
  exactAw010aS7HarnessSemanticTokens,
);

const aw010aS7ImportSpecifiers = [
  ...aw010aS7TestSource.matchAll(/\bimport\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gu),
].map((match) => match[1]);
const aw010aS7DbCrossPathImports = aw010aS7ImportSpecifiers.filter((specifier) =>
  specifier.startsWith("../../../packages/db/"),
);
assertExactOrderedList("AW-010A S7 direct DB source imports", aw010aS7DbCrossPathImports, [
  "../../../packages/db/test/support/postgres.js",
]);
const forbiddenAw010aS7BareDatabaseImport = aw010aS7ImportSpecifiers.find((specifier) =>
  /^(?:@agent-workspace\/db|@testcontainers\/postgresql|@types\/pg|pg|testcontainers)(?:\/|$)/u.test(
    specifier,
  ),
);
if (forbiddenAw010aS7BareDatabaseImport !== undefined) {
  throw new Error(
    `AW-010A S7 integration has a forbidden bare database import: ${forbiddenAw010aS7BareDatabaseImport}`,
  );
}
if (
  aw010aS7TestSource.includes("../../../packages/db/src/") ||
  !aw010aS7TestSource.includes('} from "../../../packages/db/test/support/postgres.js";')
) {
  throw new Error(
    "AW-010A S7 integration must use only the approved DB test-support import and frozen SQL artifacts",
  );
}

for (const [label, pattern, expectedCount] of [
  ["startPostgresTestHarness call", /\bstartPostgresTestHarness\s*\(\s*\)/gu, 1],
  ["frozen migration application", /\bapplyFrozenMigrations\s*\(\s*\)/gu, 2],
  [
    "runtime harness connection",
    /\bactiveHarness\s*\(\s*\)\s*\.\s*connect\s*\(\s*"runtime"\s*\)/gu,
    1,
  ],
  ["harness stop call", /\btestHarness\s*\.\s*stop\s*\(\s*\)/gu, 1],
  ["Docker residue command", /\bexecFile\s*\(\s*"docker"\s*,\s*args\b/gu, 1],
  ["deadline timer", /\bsetTimeout\s*\(/gu, 1],
  ["deadline timer clear", /\bclearTimeout\s*\(/gu, 1],
  ["deferred concurrency barrier", /\bdeferred<void>\s*\(\s*\)/gu, 3],
  ["barrier release", /\bbarrier\s*\.\s*resolve\s*\(\s*\)/gu, 3],
  ["barrier wait", /\bawait\s+barrier\s*\.\s*promise\b/gu, 3],
  ["bounded concurrent aggregate", /\bawait\s+withDeadline\s*\(/gu, 3],
]) {
  const actualCount = aw010aS7TestSource.match(pattern)?.length ?? 0;
  if (actualCount !== expectedCount) {
    throw new Error(
      `AW-010A S7 ${label} count must equal ${expectedCount}; received ${actualCount}`,
    );
  }
}
if (/\b(?:setInterval|sleep)\s*\(|\bimport\s*\(/u.test(aw010aS7TestSource)) {
  throw new Error("AW-010A S7 integration forbids sleeps, intervals, and dynamic imports");
}

const forbiddenAw010aS7Output = aw010aS7TestSource.match(
  /\bconsole\s*\.|\bprocess\s*\.\s*(?:env|stderr|stdout)\b|\b(?:stderr|stdout)\s*\.\s*write\s*\(|\bexecFile\s*\(\s*["'](?:env|printenv)["']/u,
);
if (forbiddenAw010aS7Output !== null) {
  throw new Error(`AW-010A S7 integration has forbidden URL or environment output surface`);
}

const aw010aS7AfterAllStart = aw010aS7TestSource.indexOf("afterAll(async () => {");
const aw010aS7DescribeStart = aw010aS7TestSource.indexOf(
  'describe("AW010A-S7 real PostgreSQL channel event journal", () => {',
);
if (
  aw010aS7AfterAllStart === -1 ||
  aw010aS7DescribeStart === -1 ||
  aw010aS7AfterAllStart >= aw010aS7DescribeStart ||
  (aw010aS7TestSource.match(/\bafterAll\s*\(/gu) ?? []).length !== 1
) {
  throw new Error(
    "AW-010A S7 integration must define exactly one teardown before its test inventory",
  );
}
const aw010aS7AfterAllSource = aw010aS7TestSource.slice(
  aw010aS7AfterAllStart,
  aw010aS7DescribeStart,
);
const aw010aS7TeardownStageTokens = [
  "const capture = captureHarnessEvidence(testHarness);",
  "const failures: unknown[] = [];",
  "failures.push(...(await inspectEvidenceBeforeStop(capture)));",
  "await testHarness.stop();",
  "const residue = await findResidualContainerIds(capture.resources.labels);",
  "harness = undefined;",
  "if (failures.length === 1)",
  "throw failures[0];",
  "if (failures.length > 1)",
  'throw new AggregateError(failures, "PostgreSQL integration teardown failed");',
];
let previousAw010aS7TeardownStageIndex = -1;
for (const token of aw010aS7TeardownStageTokens) {
  const index = aw010aS7AfterAllSource.indexOf(token, previousAw010aS7TeardownStageIndex + 1);
  if (index === -1) {
    throw new Error(`AW-010A S7 teardown has invalid evidence-stop-residue ordering at: ${token}`);
  }
  previousAw010aS7TeardownStageIndex = index;
}
assertSourceIncludesAll("AW-010A S7 non-short-circuiting teardown", aw010aS7AfterAllSource, [
  `try {
    failures.push(...(await inspectEvidenceBeforeStop(capture)));
  } catch {
    failures.push(new Error("evidence: inspection pipeline failed"));
  }
  try {
    await testHarness.stop();
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      const residue = await findResidualContainerIds(capture.resources.labels);`,
  'throw new AggregateError(failures, "PostgreSQL integration teardown failed");',
]);

assertExactOrderedList(
  "AW-010A S7 per-test semantic inventory",
  [...exactAw010aS7SemanticTokensByTestName.keys()],
  exactAw010aS7TestNames,
);
for (const [index, name] of exactAw010aS7TestNames.entries()) {
  const literal = `"${name}"`;
  const start = aw010aS7TestSource.indexOf(literal);
  const nextName = exactAw010aS7TestNames[index + 1];
  const end =
    nextName === undefined
      ? aw010aS7TestSource.length
      : aw010aS7TestSource.indexOf(`"${nextName}"`);
  if (
    start === -1 ||
    end === -1 ||
    start >= end ||
    aw010aS7TestSource.indexOf(literal, start + literal.length) !== -1
  ) {
    throw new Error(`AW-010A S7 test must have one exact literal inventory location: ${name}`);
  }
  const expectedTokens = exactAw010aS7SemanticTokensByTestName.get(name);
  if (expectedTokens === undefined) {
    throw new Error(`AW-010A S7 semantic inventory is missing: ${name}`);
  }
  assertSourceIncludesAll(name, aw010aS7TestSource.slice(start, end), expectedTokens);
}

const workspacePolicy = await readFile(resolve(root, "pnpm-workspace.yaml"), "utf8");
if (workspacePolicy !== canonicalWorkspacePolicy) {
  throw new Error("pnpm-workspace.yaml does not match the AW-008 frozen build policy");
}

const workflow = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
if (workflow !== canonicalWorkflow) {
  throw new Error("PR workflow does not match the immutable AW-008 blocking lane");
}

const schemaSource = await readFile(resolve(root, "packages/db/src/schema/foundation.ts"), "utf8");
const sourceTableNames = [...schemaSource.matchAll(/\bpgTable\(\s*"([^"]+)"/gu)].map(
  (match) => match[1],
);
assertExactList("Drizzle source tables", sourceTableNames, exactMigrationTables);

const migrationSql = await readFile(
  resolve(root, "packages/db/drizzle/0000_aw008_foundation.sql"),
  "utf8",
);
const migrationTableNames = [...migrationSql.matchAll(/\bCREATE TABLE\s+"([^"]+)"/gu)].map(
  (match) => match[1],
);
assertExactList("Migration SQL tables", migrationTableNames, exactMigrationTables);

const migrationSnapshot = await readJson("packages/db/drizzle/meta/0000_snapshot.json");
const snapshotTableNames = Object.values(migrationSnapshot.tables ?? {}).map((table) => table.name);
assertExactList("Migration snapshot tables", snapshotTableNames, exactMigrationTables);

const channelStreamMigrationSql = await readFile(
  resolve(root, "packages/db/drizzle/0001_aw010a_channel_stream.sql"),
  "utf8",
);
const channelStreamMigrationStatements = channelStreamMigrationSql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);
assertExactOrderedList(
  "0001 migration leading locks",
  channelStreamMigrationStatements.slice(0, 2).map(normalizedSqlStatement),
  [
    "lock table public.channels in access exclusive mode;",
    "lock table public.channel_membership_epochs in access exclusive mode;",
  ],
);

const topLevelTransactionControl = channelStreamMigrationStatements.find((statement) =>
  /^(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/iu.test(statement),
);
if (topLevelTransactionControl !== undefined) {
  throw new Error("0001 migration must not contain top-level transaction control");
}

const channelStreamMigrationTableNames = [
  ...channelStreamMigrationSql.matchAll(
    /\bCREATE\s+TABLE\s+(?:(?:"public"|public)\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/giu,
  ),
].map((match) => match[1]);
assertExactOrderedList(
  "0001 migration SQL tables",
  channelStreamMigrationTableNames,
  exactChannelStreamMigrationTables,
);

const channelStreamFunctionNames = [
  ...channelStreamMigrationSql.matchAll(
    /\bCREATE\s+FUNCTION\s+(?:(?:"public"|public)\.)?"?([a-z_][a-z0-9_]*)"?\s*\(\s*\)/giu,
  ),
].map((match) => match[1]);
assertExactOrderedList(
  "0001 migration functions",
  channelStreamFunctionNames,
  exactChannelStreamFunctionNames,
);

const channelStreamTriggerMatches = [
  ...channelStreamMigrationSql.matchAll(
    /\bCREATE\s+(CONSTRAINT\s+)?TRIGGER\s+"?([a-z_][a-z0-9_]*)"?/giu,
  ),
];
assertExactOrderedList(
  "0001 migration triggers",
  channelStreamTriggerMatches.map((match) => match[2]),
  exactChannelStreamTriggerNames,
);
assertExactOrderedList(
  "0001 migration constraint triggers",
  channelStreamTriggerMatches.filter((match) => match[1] !== undefined).map((match) => match[2]),
  ["channel_membership_epochs_event_type_guard"],
);

const membershipEventForeignKeyStatements = channelStreamMigrationStatements.filter((statement) =>
  /^ALTER\s+TABLE\s+(?:(?:"public"|public)\.)?"?channel_membership_epochs"?[\s\S]*\bFOREIGN\s+KEY\b/iu.test(
    statement,
  ),
);
const membershipEventForeignKeyNames = membershipEventForeignKeyStatements.map((statement) => {
  const match = statement.match(/\bADD\s+CONSTRAINT\s+"?([a-z_][a-z0-9_]*)"?\s+FOREIGN\s+KEY\b/iu);
  return match?.[1] ?? "<missing>";
});
assertExactOrderedList(
  "0001 migration membership event foreign keys",
  membershipEventForeignKeyNames,
  exactMembershipEventForeignKeyNames,
);
if (
  membershipEventForeignKeyStatements.some(
    (statement) => !/\bNOT\s+DEFERRABLE\s*;\s*$/iu.test(statement),
  ) ||
  (channelStreamMigrationSql.match(/\bNOT\s+DEFERRABLE\b/giu) ?? []).length !== 2
) {
  throw new Error(
    "0001 migration membership event foreign keys must be ordinary NOT DEFERRABLE FKs",
  );
}

const deferredGuardStatements = channelStreamMigrationStatements.filter((statement) =>
  /\bDEFERRABLE\s+INITIALLY\s+DEFERRED\b/iu.test(statement),
);
if (
  deferredGuardStatements.length !== 1 ||
  !/^CREATE\s+CONSTRAINT\s+TRIGGER\s+channel_membership_epochs_event_type_guard\b/iu.test(
    deferredGuardStatements[0] ?? "",
  )
) {
  throw new Error(
    "0001 migration must defer only the channel membership event type constraint trigger",
  );
}

const prohibitedChannelStreamSurface = channelStreamMigrationSql.match(
  /\b(?:down|drop|message_versions?|outbox|idempotency|projections?|read_states?)\b/iu,
);
if (prohibitedChannelStreamSurface !== null) {
  throw new Error(
    `0001 migration contains prohibited future or destructive surface: ${prohibitedChannelStreamSurface[0]}`,
  );
}

const channelStreamMigrationSnapshot = await readJson(
  "packages/db/drizzle/meta/0001_snapshot.json",
);
assertExactList(
  "0001 cumulative migration snapshot tables",
  Object.keys(channelStreamMigrationSnapshot.tables ?? {}),
  exactCumulativeMigrationSnapshotTables,
);
assertExactList(
  "0001 cumulative migration snapshot table names",
  Object.values(channelStreamMigrationSnapshot.tables ?? {}).map((table) => table.name),
  [...exactMigrationTables, ...exactChannelStreamMigrationTables],
);
assertExactList(
  "0001 migration snapshot top-level objects",
  Object.keys(channelStreamMigrationSnapshot),
  [
    "id",
    "prevId",
    "version",
    "dialect",
    "tables",
    "enums",
    "schemas",
    "sequences",
    "roles",
    "policies",
    "views",
    "_meta",
  ],
);
if (
  channelStreamMigrationSnapshot.prevId !== migrationSnapshot.id ||
  channelStreamMigrationSnapshot.version !== "7" ||
  channelStreamMigrationSnapshot.dialect !== "postgresql"
) {
  throw new Error("0001 migration snapshot lineage or generated format is invalid");
}
assertExactObject(
  "0001 migration snapshot enums",
  channelStreamMigrationSnapshot.enums ?? {},
  exactMigrationSnapshotEnums,
);
for (const [tableName, expectedIndexNames] of exactMigrationSnapshotIndexNamesByTable) {
  const snapshotTable = channelStreamMigrationSnapshot.tables?.[tableName];
  if (snapshotTable === undefined || snapshotTable.schema !== "") {
    throw new Error(`0001 migration snapshot table has an invalid generated schema: ${tableName}`);
  }
  assertExactList(
    `0001 migration snapshot indexes for ${tableName}`,
    Object.keys(snapshotTable.indexes ?? {}),
    expectedIndexNames,
  );
}
assertExactObject(
  "0001 migration snapshot generated schema objects",
  {
    schemas: channelStreamMigrationSnapshot.schemas ?? {},
    sequences: channelStreamMigrationSnapshot.sequences ?? {},
    roles: channelStreamMigrationSnapshot.roles ?? {},
    policies: channelStreamMigrationSnapshot.policies ?? {},
    views: channelStreamMigrationSnapshot.views ?? {},
    _meta: channelStreamMigrationSnapshot._meta ?? {},
  },
  {
    schemas: {},
    sequences: {},
    roles: {},
    policies: {},
    views: {},
    _meta: { columns: {}, schemas: {}, tables: {} },
  },
);

const migrationJournal = await readJson("packages/db/drizzle/meta/_journal.json");
assertExactObject("Migration journal", migrationJournal, {
  version: "7",
  dialect: "postgresql",
  entries: [
    {
      idx: 0,
      version: "7",
      when: 1787648708709,
      tag: "0000_aw008_foundation",
      breakpoints: true,
    },
    {
      idx: 1,
      version: "7",
      when: 1787695124181,
      tag: "0001_aw010a_channel_stream",
      breakpoints: true,
    },
  ],
});
if (
  migrationJournal.entries[1].idx <= migrationJournal.entries[0].idx ||
  migrationJournal.entries[1].when <= migrationJournal.entries[0].when
) {
  throw new Error("Migration journal entries must be strictly ordered by idx and when");
}

const staticModuleSpecifierPattern =
  /(?:\bimport\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?|\bexport\s+[^"']*?\s+from\s+)["']([^"']+)["']/gu;
const dynamicModuleSpecifierPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
for (const sourcePath of implementationFiles.filter((path) =>
  /^packages\/contracts\/src\/.*\.ts$/u.test(path),
)) {
  const source = await readFile(resolve(root, sourcePath), "utf8");
  const specifiers = [
    ...[...source.matchAll(staticModuleSpecifierPattern)].map((match) => match[1]),
    ...[...source.matchAll(dynamicModuleSpecifierPattern)].map((match) => match[1]),
  ];
  const forbiddenSpecifier = specifiers.find(
    (specifier) =>
      specifier !== undefined &&
      !specifier.startsWith("./") &&
      !specifier.startsWith("../") &&
      !specifier.startsWith("node:") &&
      specifier !== "zod",
  );
  if (forbiddenSpecifier !== undefined) {
    throw new Error(
      `Contracts runtime import is outside the AW-008 allowlist in ${sourcePath}: ${forbiddenSpecifier}`,
    );
  }
}

for (const testPath of implementationFiles.filter((path) => /\.spec\.[cm]?[jt]sx?$/u.test(path))) {
  const source = await readFile(resolve(root, testPath), "utf8");
  if (forbiddenTestMarker.test(source)) {
    throw new Error(`Skipped, conditional, todo, or only test is forbidden in AW-008: ${testPath}`);
  }
}

console.log(
  `AW-008 scaffold verified: ${requiredRootFiles.length + implementationFiles.length} required files, ${packageNamesByManifest.size} workspace packages, ${Object.keys(canonicalRootScripts).length} root scripts, ${exactMigrationTables.length} migration tables`,
);
