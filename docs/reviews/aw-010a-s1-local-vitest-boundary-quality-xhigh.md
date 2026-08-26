# REQUEST_CHANGES

## Blocking findings

1. `packages/chat-core/vitest.config.ts` still imports `@agent-workspace/test-config/vitest`. This preserves the forbidden cross-package edge instead of making the Vitest configuration local. The live boundary check fails:

   ```text
   error chat-core-dependencies-are-restricted: packages/chat-core/vitest.config.ts → packages/test-config/src/vitest.ts
   ```

2. `packages/chat-core/package.json` still declares `@agent-workspace/test-config`, and the chat-core lock importer still adds its workspace link. The requested supply delta is Vitest only; remove both test-config entries.

3. The local config does not directly freeze the required invariants. It must explicitly set `environment: "node"`, `globals: false`, `passWithNoTests: false`, `clearMocks: true`, and `restoreMocks: true` without weakening `.dependency-cruiser.cjs`.

## Quality / supply assessment

Duplicating these five stable test defaults locally is the correct tradeoff: the small DRY cost avoids a forbidden package dependency and adds no package/version beyond the already pinned `vitest@4.1.11`. The current lock diff introduces no new resolved package graph, but its extra test-config importer edge is out of scope.

## Verification

- `pnpm boundaries:check` — **failed** (1 `chat-core-dependencies-are-restricted` error)
- chat-core lint — passed
- chat-core typecheck — passed
- chat-core unit tests — passed (12/12)

Approval requires the root boundary check to pass with the existing dependency-cruiser rule intact.
