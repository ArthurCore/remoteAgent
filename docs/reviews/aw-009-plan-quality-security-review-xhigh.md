REQUEST_CHANGES

# AW-009 / AW-010A Plan Quality and Security Review — xhigh

## High

### H1 — The mutation-time session check is not yet a linearizable revocation/deactivation protocol

AW-009 §§4 and 11 require a recheck “before commit” and test only the interleaving in which revocation commits before the resumed write (`aw-009…md:83-86, 225-231`). Under PostgreSQL `READ COMMITTED`, a non-locking recheck can pass and revocation/deactivation can commit between that read and the protected mutation/commit. Both operations can then report success, with the protected write ordered after revocation in wall-clock/commit order.

Freeze one exact protocol before implementation: the write transaction must lock the exact tenant-leading `identity_sessions` row and active principal row in a fixed order and hold those locks through commit (or use an equivalently proved conditional-write/serializable protocol), while revocation and deactivation use the compatible conflicting protocol. Tests must cover revocation and deactivation linearizing (a) before lock acquisition, (b) while the mutation holds the lock, (c) after the final authorization read but before DML, and (d) after DML but before commit. The required invariant is zero protected writes whenever revocation/deactivation linearizes first; a mutation that linearizes first may commit before the revoker. Middleware plus a late ordinary `SELECT` is insufficient.

### H2 — “mutation-origin/CSRF policy” is a placeholder, not a security contract

`SameSite=Lax` is useful defense in depth, but `aw-009…md:65,178,302` never defines the promised origin guard. Freeze the exact cookie-authenticated mutation rule: trusted public origins must come from validated configuration rather than reflected `Host`/`X-Forwarded-*`; unsupported/missing/`null`/cross-site `Origin` cases must have an explicit fail-closed result; CORS and Fetch Metadata behavior must be stated; no state-changing `GET` may exist. If non-browser clients are intended later, they need a separate non-cookie authentication rule rather than a missing-Origin bypass.

Add real-browser/API negatives for cross-site form and fetch requests, `Origin: null`, absent/multiple/malformed Origin, spoofed forwarding headers, and the configured loopback E2E origin. Any new CSRF/CORS dependency or proxy-trust change requires the same pre-install disclosure as §3.

### H3 — The corrected AW-010A membership precondition still has a migration/cutover race

The post-dispatch correction at `aw-010a…md:55` is correct and important: existing channels receive sequence state `0` only after proving `channel_membership_epochs` is empty, and any pre-stream membership row fails migration rather than receiving a synthetic history marker. That resolves the prior laundering issue.

The plan still does not state how the emptiness check, channel backfill, postcondition, and application cutover exclude concurrent legacy/direct inserts. A membership row can appear after the check, or a channel can appear after the backfill and before all writers use the new atomic channel+sequence path. Freeze explicit table locks in the migration transaction and a deployment/quiescence/route-inventory gate (or another proved compatible dual-write design), then assert at commit that membership remains empty and every channel has exactly one `(tenant_id, channel_id)` sequence row. Test concurrent channel and membership DML against the migration, not only two concurrent migrators. State the forward-migration/application-rollback behavior; do not depend silently on “there should be no old writer.”

### H4 — AW-009 does not define a safe forward migration for populated AW-008 tables

AW-009B adds names/name keys, creator and creation-command/fingerprint state to existing workspace/channel-related rows (`aw-009…md:91-102, 279-286`) but gives no nullability, staged constraint, deterministic backfill, or fail-on-existing-data rule. An AW-008 database may legally contain tenants, principals, workspaces, channels, and even workspace memberships even though product membership writes were blocked. Fabricating creator/idempotency receipts would be as invalid as fabricating join event sequences; adding immediate `NOT NULL` columns can instead fail midway or force unsafe defaults.

Freeze the exact per-table compatibility rule. If meaningful backfill is impossible, fail atomically on the relevant pre-product rows and document the operational preflight; otherwise use an explicit expand/backfill/validate/constrain sequence with provenance-preserving values. Test migration from a populated `0000` database, every rejected precondition, atomic rollback, rerun, hash drift, and application rollback compatibility. Principal deactivation can be additive/null-safe, but that does not solve the workspace/channel provenance columns.

### H5 — Durable actor and envelope provenance is not assigned precisely enough

AW-010A correctly keeps `system` out of `principal_kind_v1` and does not add a blanket actor FK (`aw-010a…md:68-78`). However, the port sketch accepts an `event: unknown`, and “canonical system actors” is not an actual registry or authorization rule. Context-free `DurableEventV1` validation permits any opaque ID with `kind: "system"`; it also does not prove that a human/service actor exists in the envelope tenant or that actor, event ID, occurrence time, tenant, and channel were server/trusted-context derived. This permits durable audit spoofing if ownership is implemented differently by callers.

Freeze a constructor/input type that cannot accept client-owned envelope fields accidentally. Assign generation/validation ownership for `tenant_id`, `channel_id`, `event_seq`, `event_id`, `actor`, and `occurred_at`; require tenant-leading human/service existence checks in the caller transaction; define an allowlisted stable system-actor representation and which trusted use cases may select it. For AW-009 joins, actor must be the immutable active human session actor and payload target semantics must be checked in the same transaction. Add negative tests for arbitrary system IDs, kind/DB-principal mismatch, cross-tenant actors, client-supplied envelope overrides, and malformed discriminant/payload pairs.

### H6 — The trace/evidence requirements can exfiltrate the very credentials they forbid

The dependency table approves Playwright partly for traces (`aw-009…md:51`), authenticated E2E uses a signed cookie, and CI retains evidence on success/failure, while §11 says cookies, signing keys, authorization headers, and DB URLs must never enter traces/artifacts/logs (`aw-009…md:240-250`). Playwright traces commonly retain network request metadata and browser context/storage. File modes and an ephemeral database do not make an uploaded signed credential acceptable, and a repository Gitleaks pass does not prove generated archives are clean.

Choose and freeze an enforceable artifact policy: either do not record/retain authenticated traces, or use a reviewed redaction/export mechanism and scan the actual recursively unpacked upload set before upload. Add canary credentials to prove the gate fails closed, enumerate allowed artifact paths and exact file counts, and ensure the upload step cannot run on a failed secret scan. The same gate must cover JSON/JUnit, browser traces/screenshots/videos, server logs, correlation dumps, temporary files, and archive contents.

## Medium

### M1 — The generic runtime-role residual risk is disclosed only halfway

`aw-010a…md:77` honestly says current generic runtime grants cannot prevent direct sequence-state writes, and it makes no unsupported `SECURITY DEFINER` claim. The same role can also directly `INSERT` structurally or semantically invalid journal rows if it has the append grant; an UPDATE/DELETE trigger proves immutability, not authorized/canonical append integrity. Sequence-state delete/rewind and direct journal insert must be named as accepted residual risks, with the exact grant matrix and role tests. Do not describe the trigger as a complete journal integrity boundary.

If stronger privilege separation becomes required, treat it as the separate reviewed role design already anticipated by the plan. Do not silently introduce a `SECURITY DEFINER` allocator/append routine; such a design would need a non-login owner, fixed safe `search_path`, fully qualified objects, revoked `PUBLIC` execute, constrained grants, tenant-leading validation, injection/adversarial tests, and migration/rollback analysis.

### M2 — Signing-key rotation, cookie decoding, fixation scope, and logout replay need exact rules

`aw-009…md:63-87` needs to freeze secret entropy/encoding and duplicate handling; current-key signing versus previous-key verification; the maximum previous-key acceptance window relative to DB session expiry; whether successful old-key verification reissues under the current key; and strict decode-after-unsign of a versioned payload with unknown/duplicate fields rejected. Cookie deletion must use the exact name/path/security attributes of issuance.

The plan has no production issuance/login flow, so classic pre-auth-to-auth session fixation should be stated as not applicable to this increment, with the test fixture required to create a fresh high-entropy DB session rather than honor a browser-selected ID. Also reconcile “revoked returns 401” with “repeat logout is neutral”: define whether logout always clears and returns 204 for an absent/revoked but parseable credential, without creating a session/resource oracle. Rotation, old-key retirement, duplicate-cookie parsing, clear-cookie, and replay tests are required.

### M3 — Sequence-state `version` and boundary behavior are ambiguous

AW-010A freezes `version bigint default 1` but specifies only that `last_event_seq` increments (`aw-010a…md:43-57`). State whether `version` changes. Incrementing both naïvely overflows `version` before the final otherwise-valid event sequence; never changing it makes its concurrency/version meaning unclear. Freeze the guarded SQL and typed error mapping for missing state versus exhausted stream, including zero-row behavior. Test `MAX-1`, `MAX`, concurrent contenders at the boundary, insert/validation/unique failure rollback, and prove neither bigint ever passes through JavaScript `Number`.

### M4 — Concurrent idempotency and self-join races are asserted but not explicitly proved

Resource-row receipts and the partial one-active-epoch uniqueness constraint can make replay safe only if conflict recovery is tenant-leading and the losing transaction rolls back its allocated event (`aw-009…md:89-100,218-236`). Add real-PostgreSQL races for same key/same fingerprint, same key/different fingerprint, different keys targeting the same active self-join, and concurrent creator auto-join. Prove exactly one committed resource/epoch/event, stable replay result, no counter advance from the loser, and concealed errors across tenants.

### M5 — Browser installation and hosted fail-closed behavior need an operationally reproducible lane

The explicit Chromium download is properly disclosed, but `pnpm exec playwright install chromium` does not state how cold-run host libraries are supplied or pinned on mutable `ubuntu-latest`. If `--with-deps`, apt/root/network access, or a browser container is needed, disclose and pin that impact before installation. Record and verify the actual browser revision/image identity. Keep integration/isolation/Chromium as explicit hosted gates—`pnpm run ci` alone must not be reported as full AW-009 success—and prove artifact upload cannot mask an earlier failing gate.

## Controls already judged directionally sound

- Tenant and principal are session-derived; protected repository predicates and FKs are required to be tenant-leading, and opaque IDs are explicitly not authorization.
- Cross-tenant/nonexistent/private-nonmember cases share a concealed 404 class, while known public-resource role denial is a 403; isolation inventory is fail-closed for implemented routes and does not claim future WS/search/file/admin coverage.
- AW-010A uses caller-owned transactions, a guarded row update rather than `MAX()+1` or JavaScript `Number`, rollback tests, a journal mutation trigger, immutable `0000` artifacts, and forward migration/hash-drift gates.
- External dependency and Chromium lifecycle impact is disclosed before installation, and AW-010A is correctly a hard dependency of membership writes.

Approval requires resolving H1-H6 and M1-M5 in the plans and returning the revised plans for independent review. No implementation should begin under the current A0 gates.
