# AW-008G Full Evidence Handoff — xhigh

## Scope

- Verified implementation head: `17442e6a4957c81786415b3164c936b4add2573e` on `aw-008f1-workspace-pr-integration`.
- Repository/PR: public `ArthurCore/remoteAgent`, `https://github.com/ArthurCore/remoteAgent/pull/1`.
- Authority: `docs/plans/aw-008-contracts-db-foundation.md` §11 and AW-008G.
- AW-008G's first independent review recovered one missing approved gate: `fast-check@4.9.0` was pinned but unused despite the required seeded L1 wire properties. The failure was routed to the contracts-test owner and closed in `17442e6a4957c81786415b3164c936b4add2573e`; no production source, manifest, lockfile, workflow, migration, or generated artifact changed. Evidence documents are the remaining intended handoff changes.
- Secret values, database URLs, generated role credentials, and storage credentials were neither printed nor retained. Values below are non-secret identities, counts, hashes, and public GitHub handles.

## §11.1 — Frozen tree, canonical CI, contracts, artifacts, boundaries

Final committed implementation tree verification:

- `CI=true pnpm install --frozen-lockfile`: PASS.
- `TURBO_FORCE=true pnpm run ci`: PASS with remote caching disabled and four Turbo task groups reporting cache zero.
- Format, lint, typecheck, dependency boundaries, exact negative boundary fixture, unit tests, DB integrity, scaffold exactness, and production builds all passed.
- Contracts unit: `190/190`; DB unit: `64/64`; generated contract artifact tests: `81/81`; no failure marker.
- Six deterministic fast-check properties cover accepted/rejected Opaque ID and cursor length buckets plus accepted/rejected canonical wire BIGINT values. Seeds `8008001` through `8008006` and run counts `256/256/128/64/512/512` are frozen in source, totaling 1,728 reproducible property runs. Every accepted length run includes exact minimum, interior, near-maximum, and exact maximum buckets; rejection runs include empty/oversized strings or every declared event-sequence rejection class.
- Scaffold: exactly 103 required files, nine workspace packages, nineteen root scripts, and six migration tables.
- Public runtime export oracle: exactly 35 names; `Object.keys(publicContracts).sort()` is compared to the frozen list in `packages/contracts/test/artifacts.spec.ts`.
- Generated contract artifacts remained byte-stable:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `openapi-sync-v1.json` | 6,457 | `cf19e093f55e12505156103cfe4716907da9f11c5aecff352466a02cd8b844ea` |
| `sync-v1.schema.json` | 27,323 | `5660df23f0b6957d929fef9848e3707e942ab20f8b00d526df841142dcea7882` |

The local CI diagnostic log was mode `0600`; raw parsing confirmed all exact counts, boundary/scaffold messages, cache zero, and no failure marker.

## §11.2 — Real PostgreSQL/Testcontainers

A final retained local run against the digest-pinned PostgreSQL 17.11 image passed three files and `25/25` tests. It covered the migration first/second/concurrent/failing/hash-drift lanes, six-table constraints and cross-tenant negatives, membership-epoch constraints, owner/migrator/runtime role boundaries, future defaults, runtime CRUD and DDL/ledger denial, evidence semantics, stale janitor ownership rules, and cleanup aggregation.

- Retained evidence: exactly two valid JSON documents, sixteen top-level fields each.
- File sizes: 1,469 bytes each.
- File modes: both `0600`.
- Provider-token, private-key, credential-URL pattern matches: zero.
- Exact harness-labeled container residue after the run: zero.
- The final janitor race correction had already passed 20/20 fresh-process focused runs and three separate full local runs, each `25/25` with residue zero, before independent PASS/APPROVED review and commit.

Bare ambient migration execution was also rechecked with `MIGRATION_DATABASE_URL`, `MIGRATION_TARGET_CLASS`, and `DATABASE_URL` unset. It exited 2 with the generic intended configuration error, before network access; network-error markers and secret/URL markers were both zero.

Frozen migration topology and hashes remained exactly:

| Artifact | SHA-256 |
|---|---|
| `0000_aw008_foundation.sql` | `645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2` |
| `meta/_journal.json` | `e10eae9ec0df3cc6b2d809031b4250a1bc369d51f51659d7b60dc2262bec228d` |
| `meta/0000_snapshot.json` | `2dbb8666e9f74ba19e1faa4d3df0309db2a5d29f65aaa6648e399070cbe23fc1` |

## §11.3 — Actual public GitHub-hosted PR lane

`docs/reviews/aw-008f1-public-pr-workflow-closure-xhigh.md` contains the failure-to-correction ledger and detailed B1 closure. The authoritative hosted run is `32872753268` at immutable PR head `2bbb0f1016a37947e9f3172f64c0a4ed1078a7df`.

Three attempts at that exact head all succeeded:

| Attempt | Job | Runner | Result |
|---:|---:|---:|---|
| 1 | `97883444019` | `1000002216` | SUCCESS |
| 2 | `97884660831` | `1000002217` | SUCCESS |
| 3 | `97885762628` | `1000002218` | SUCCESS |

Raw logs from every attempt independently confirmed contracts `184/184`, DB unit `64/64`, artifact tests `81/81`, integration `25/25`, cache zero, no failure marker, and successful evidence upload. Each attempt artifact was downloaded before the next rerun and contained exactly two valid JSON files with zero credential-pattern matches. The current unexpired artifact is `9573036526`, 1,592 bytes, with expiry `2026-11-23T16:41:32Z`.

Those three attempts establish F1 runner/test/artifact stability at `2bbb0f1`. The later contracts-test-only property correction raises the contracts count to `190/190`; the final evidence-document PR head must complete the blocking workflow once more before merge and AW-008 DONE.

GitHub's informational annotation says the pinned upload-artifact SHA targets Node 20 and is being forced onto Node 24. It completed successfully in all three attempts; no step was skipped or weakened. A future immutable action-runtime refresh is separate maintenance.

## §11.4 — Cold seven-service Compose and runtime controls

A unique project with an absent unique application image, random loopback host ports, generated safe role identifiers, and high-entropy synthetic passwords/keys completed the full lifecycle. Credential values were not logged or retained.

- Effective topology: exactly `api`, `db-migrate`, `postgres`, `rustfs`, `storage-init`, `web`, `worker`.
- Cold `up -d --build --wait`: PASS.
- PostgreSQL and RustFS health, role bootstrap, storage initialization, and first migration: PASS.
- API live/ready, worker live/ready, and Web health contracts: PASS.
- Both one-shot services exited 0 with no restart.
- Environment segregation, loopback ports, shared immutable app-image identity, non-root application UID/GID, read-only root, hardened `/tmp`, all capabilities dropped, no privilege gain, and non-privileged mode: PASS.
- PostgreSQL/RustFS exact users, capability drop, no-new-privileges, and writable state volumes: PASS.
- Runtime source/test/docs/VCS/package-manager/toolchain exclusions and root-owned mode-nonwritable runtime artifacts: PASS.
- Exact migration ledger/hash, six tables, role flags/ownership/grants, runtime CRUD, runtime DDL denial, and no forbidden-table residue: PASS.
- Forced `db-migrate` recreation followed by a second complete smoke: PASS; ledger remained exactly one row.
- `down --volumes --remove-orphans`: exact project containers/networks/volumes `0/0/0`, confirmed again by live Docker read-back.

Final application image:

- Reference: `remoteagent-aw008g-6346dff81f48:local` (local evidence only).
- ID: `sha256:03efb82aff0d07d8fa1e2de0c891413a10088a5eee4bfa00d89b34773d1feec6`.
- Size: 100,854,235 bytes.
- Platform: Linux arm64.
- OCI revision: `17442e6a4957c81786415b3164c936b4add2573e`.

The Compose diagnostic log and summary were both mode `0600` and contained zero credential-pattern matches.

## §11.5 — Secrets, vulnerability gate, SBOM, final diff

- Raw Gitleaks final-candidate scan: zero findings across 171 exact candidate files, including the two reserved independent closure-document paths.
- The prior wording at `docs/reviews/aw-008a2b-artifact-builders-quality-security-closure-xhigh.md:14` produced one `generic-api-key` false positive because ordinary structural-key/ID-class prose resembled a generic key/value phrase. The sentence was reworded without changing its review meaning; final-tree raw Gitleaks is now literally zero. Reachable history still contains the former wording and its previously adjudicated non-secret scanner match; no history rewrite was performed.
- Independent Trivy secret scan of the exact final-candidate snapshot: zero secrets.
- Trivy final-image fixed Critical gate (`--severity CRITICAL --ignore-unfixed`): zero findings when addressed directly by image ID `sha256:03efb82aff0d07d8fa1e2de0c891413a10088a5eee4bfa00d89b34773d1feec6`.
- Syft SBOM addressed directly by the same immutable image ID: parsed CycloneDX 1.7, metadata component type `container`, metadata component version `03efb82aff0d07d8fa1e2de0c891413a10088a5eee4bfa00d89b34773d1feec6`, 3,538 components, serial number present.
- `git diff --check`: PASS before handoff writing. Final evidence-only diff must pass again before commit.

## Residuals and boundaries

- No production migration provisioning was added; managed-production provisioning remains M1-OPS-owned.
- No sequence allocator/product membership write was added. AW-009 must resolve durable `channel.member_joined` sequence ownership before membership writes.
- No AW-010 message/event/outbox/idempotency/projection table was added.
- Shared Mind, product Kanban, Orchestrator product behavior, and Agent runtime remain deferred.
- Final-tree raw Gitleaks and Trivy secret counts are both zero. Reachable history still has the explicitly disclosed ordinary-prose Gitleaks false positive; history is not described as scanner-zero and was not rewritten.

## Handoff determination

All executable §11 gates completed with real local, Docker, PostgreSQL, and GitHub-hosted evidence. AW-008F1 B1 is resolved. This handoff is ready for the two required independent closure reviews:

1. AW-008 spec compliance;
2. AW-008 code-quality/security and evidence integrity.

AW-008 remains RUNNING until both reviews approve this handoff and the final evidence-only PR head passes its blocking workflow.

Status: **READY FOR INDEPENDENT REVIEW**
