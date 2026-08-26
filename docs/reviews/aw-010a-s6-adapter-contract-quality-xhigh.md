# AW-010A S6 Adapter Contract Preflight — Quality/Security

Status: APPROVED

## Scope reviewed

Reviewed the corrected S6 contract in `docs/plans/aw-010a-task-cards.md` against the parent AW-010A transaction, storage, validation, dependency, test-configuration, and exact-manifest constraints. This is a contract preflight only; implementation evidence remains required by the S6 red/green and independent post-implementation review gates.

## Quality/security assessment

- **Principal stabilization:** APPROVED. The tenant-leading human/service principal lookup returns `principal_kind::text` and takes `FOR SHARE`, retaining a row lock through the caller-owned transaction that conflicts with delete and non-key kind updates. Exact cardinality, tenant, and actor-kind agreement are required. The single system actor is allowlisted, and structurally forged system IDs fail before SQL.
- **Dependency boundary:** APPROVED. The adapter owns a narrow query-capability interface and does not add/import `pg` or `@types/pg`. A caller wraps its already-open transaction client; pool/controller authority and adapter transaction control are excluded.
- **Preallocation validation:** APPROVED. One generated ID and one clock value are used to construct an explicit dummy positive-sequence server envelope and validate exact `DurableEventV1` before touching sequence state. Invalid identity, timestamp, correlation, actor/payload, tenant, channel, or payload data therefore cannot consume an allocation. Caller input is never spread into either validation envelope.
- **Timestamp fidelity:** APPROVED. Requiring canonical UTC with at most six fractional digits prevents PostgreSQL `timestamptz(6)` rounding from diverging from the validated and returned injected timestamp.
- **Allocation safety:** APPROVED. Tenant-leading state lookup uses `FOR UPDATE` and text bigint; the guarded update matches the locked current bigint, enforces the signed PostgreSQL bigint maximum, and returns text. Missing and exhausted conditions have fixed codes. A zero-row update is re-read under lock and reclassified only when missing or exhausted is established; every other state fails closed as `CHANNEL_STREAM_ALLOCATION_FAILED`. JavaScript `Number`, `MAX()+1`, and standalone sequences are forbidden.
- **Row-free failures:** APPROVED. The adapter error type and diagnostics are fixed-code/fixed-message and may not include tenant, channel, principal, event, or payload values, including insert and zero-row fallback failures.
- **Insert/result integrity:** APPROVED. After actual-sequence revalidation, the insert explicitly names the exact ten non-`created_at` columns, casts payload and sequence at the SQL boundary, and requires exactly one returned row whose text sequence and event ID match the validated envelope. The result preserves bigint and the validated injected timestamp.
- **Transaction ownership:** APPROVED. The exact query order remains actor check → prevalidation → state lock → guarded update → insert. The adapter neither begins, commits, nor rolls back; the command-owning caller retains atomicity and control.
- **Fail-closed test/config staging:** APPROVED. S6's unit project is exact (health plus S6), while its integration script deliberately has no matching project and must fail with `No projects matched` until S7 installs the real integration project. It is not accepted as a passing placeholder.
- **Importer/build policy:** APPROVED. The only dependency/lockfile authorization is the `apps/api` workspace importer link to `../../packages/chat-core`; direct PostgreSQL packages, external resolutions, lifecycle/build-policy changes, and unrelated lockfile churn remain forbidden. The checker change is additive and S6-only.

## Findings

No blocking quality or security findings in the corrected S6 contract.

## Gate

APPROVED for S6 red/green implementation. Approval does not waive the exact 16-test inventory, focused/unit/lint/typecheck/scaffold/uncached-CI evidence, checker-diff audit, or the fresh implementation quality/security review required before commit.
