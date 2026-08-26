# AW-010A Full Evidence Handoff — xhigh

## Scope and state

- Repository: public `ArthurCore/remoteAgent`, Apache-2.0.
- Branch: `aw-009-api-web-vertical-slice`.
- Reviewed S7 implementation head: `98212cbfc6e5dcbcd6376994d5b7439454e23a26`.
- Scanner-neutral evidence-label head: `3f3ad0d97de5f50ffd3f98e2d78f344ac67f4ee2`.
- S8 candidate adds only the root API-integration script, hosted workflow step, cumulative checker closure, this handoff, and the two reserved closure reviews.
- Hosted final-head success is **PENDING**. This handoff does not treat an earlier run or local success as hosted proof and does not authorize merge or AW-009 implementation by itself.

## Delivered AW-010A boundary

AW-010A delivers the channel-local sequence authority and canonical `channel_events` journal only. It includes:

- public durable journal contracts and type-only boundary;
- Drizzle channel sequence/event declarations;
- one forward PostgreSQL migration with tenant-leading keys, checks, trigger topology, and journal immutability;
- real PostgreSQL cutover, constraint, migration, and role coverage;
- a caller-transaction PostgreSQL journal adapter with hostile-input snapshots, actor locking, bigint-safe allocation, exact errors, and no transaction control;
- real runtime-role PostgreSQL concurrency, rollback, boundary, tenant/actor, catalog, trigger, ledger, evidence, and cleanup tests.

It does not add message/history/outbox/idempotency/projection persistence, WebSocket delivery, product Kanban, Shared Mind, Agent orchestration, or AW-009 membership writes.

## Frozen artifacts and protected surfaces

- AW-008 foundation SQL SHA-256: `645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2`.
- AW-010A channel-stream SQL SHA-256: `e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26`.
- Channel-stream snapshot SHA-256: `f118e261f89cd9e6d4faefa23c972c5bd4fc84dc5a14d9cca77cbf2b642751d2`.
- Migration journal SHA-256: `70c038f3554c6b0e9eeb3bf429920d4a20c5cdfb7e6d2d02e43ccbbcc5520762`.
- Final S7 integration-test SHA-256: `844db833c25e327b8c617cdad7c4f46c828ed40f759cb15b35306ad9f5c08b6f`.
- Final API Vitest-config SHA-256: `ef19485759b1279fb8430ee36da7ff494e89cc00ee761ec8190eb3bc45fbf030`.
- PostgreSQL remains pinned to `postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad`.
- The API adapter still has no direct `pg`, `@types/pg`, Testcontainers, or DB production-source dependency. Root S8 changes add no dependency or lockfile delta.

## Local executable evidence

The final S7 candidate was verified before S8 closure with:

- API journal unit project: **20/20**.
- API real-PostgreSQL integration: **20/20**.
- DB unit: **92/92**.
- DB real-PostgreSQL integration: **49/49** across four files.
- Chat-core unit: **16/16**.
- Contracts unit: **190/190** and generated-artifact checks: **81/81**.
- Config unit: **5/5**; Web unit: **1/1**; Worker unit: **9/9**.
- Dependency boundaries: **0 violations across 97 modules / 229 dependencies**.
- Exact scaffold: **117 required files**, nine workspace packages, 19 root scripts before the S8 script delta, and six foundation migration tables.
- `TURBO_FORCE=true pnpm run ci`: PASS with **0 cached tasks** in every Turbo phase.
- Frozen offline install: PASS with an unchanged lockfile.
- `git diff --check`: PASS.
- Exact-label running/stopped PostgreSQL harness residue: **0**.

## Retained evidence rehearsal

A clean temporary shared `AW008D_TEST_EVIDENCE_DIRECTORY` was used for the DB integration command followed by the API integration command:

- DB: **49/49**; API: **20/20**.
- Exactly **4** retained JSON files with **4** unique run IDs: three shared-directory DB harness records and one API harness record. The DB retained-evidence self-test intentionally uses its own private directory and is not uploaded from the shared directory.
- Every shared artifact was a regular non-symlink file with mode `0600`.
- Every artifact parsed with the exact top-level keys `version`, `runId`, `resourceName`, `image`, `dockerImageReference`, `dockerImageId`, `containerId`, `containerName`, `database`, `schemas`, `labels`, `connection`, `createdAt`, `testSeed`, `migrationHash`, and `staleContainerIdsRemoved`.
- Complete-byte credential-pattern matches: **0**.
- Exact-label running/stopped container residue after both phases: **0**.
- The temporary directory was removed after verification.

## S8 script and hosted-order contract

The root adds exactly:

```text
test:integration:api = pnpm --filter @agent-workspace/api test:integration
```

The blocking pull-request job retains read-only `contents` permission and immutable action SHAs. Its order is exact:

1. checkout;
2. Node `24.15.0` with automatic package-manager cache disabled;
3. Corepack and pnpm `11.23.0`;
4. frozen install;
5. forced uncached canonical CI;
6. DB integration with the shared retained-evidence directory;
7. API PostgreSQL integration with the same directory;
8. fail-closed, always-run upload of `artifacts/testcontainers/*.json` using the existing pinned upload action.

The final-head hosted run must show DB **49/49**, API **20/20**, the upload step success, and the artifact inventory required above. No earlier hosted run is final-head proof.

## Security and configuration scan evidence

Tools used locally:

- Gitleaks `8.30.1`.
- Trivy `0.74.0`.

The exact tracked-candidate snapshot, excluding generated/ignored worktree outputs by construction, was scanned with raw Gitleaks redaction and no allowlist. Result: **0 findings** after scanner-neutral rewording of two ordinary SHA-256 labels; no suppression or rule weakening was added.

Trivy config scanning of the clean candidate snapshot with explicit generated-directory exclusions and severity `HIGH,CRITICAL` reported **0 misconfigurations**. Scanner output from unscoped generated build directories is not used as release evidence.

The S8 final candidate must rerun both scans after all three review documents reach their final bytes. Reachable Git history is not claimed scanner-zero and is not rewritten.

## Review and merge gate

The required independent closure documents are:

1. `docs/reviews/aw-010a-final-spec-closure-xhigh.md` — specification PASS required;
2. `docs/reviews/aw-010a-final-quality-security-closure-xhigh.md` — quality/security APPROVED required.

After both closures and the exact six-file S8 commit, the branch must be pushed and a public PR opened. AW-010A remains **RUNNING** until the workflow succeeds on that exact final commit and the uploaded evidence is downloaded and independently checked. Only then may the orchestrator create a separate board-only DONE commit and unblock AW-009.
