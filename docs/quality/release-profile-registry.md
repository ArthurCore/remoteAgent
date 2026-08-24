# Release Profile and Gate Registry (AW-006C)

- **Status:** Normative release contract
- **Scope:** Milestone 1 human Chat Core, the Milestone 2 entry boundary, and the Milestone 2 single-Agent release
- **Owner:** Release owner, with Quality, Security, Product, and Operations sign-off as assigned below

## 1. Authority and decision rules

This file is the **single authoritative registry** for release profiles and gates. Other product, plan, ADR, quality, and operations documents define requirements and test detail, but this registry decides which profile is blocking, which threshold applies to a milestone, what evidence is required, and whether a waiver is possible. If another document conflicts on socket count, topology, recovery objective, rolling deployment, gate naming, or Agent-phase entry, this registry controls until the conflict is corrected.

Lettered gate names are retired. A release manifest and review must use only these unique stable IDs:

| Gate ID | Milestone | Decision made | Blocking rule |
|---|---|---|---|
| `M1-CORRECTNESS` | M1 | Durable chat, ordering, replay, projection, and isolation-independent data correctness | Blocks the M1 release and Agent-phase entry |
| `M1-SECURITY` | M1 | Tenant/channel authorization, secret, attachment, search, and supply-chain boundaries | Blocks the M1 release and Agent-phase entry |
| `M1-UX` | M1 | Complete, accessible, responsive human-chat journeys | Blocks the M1 release and Agent-phase entry; only the narrow exception policy in §11 applies |
| `M1-OPS` | M1 | Procured platform capability, backup/restore, restart/resume, migration, observability, and operator readiness | Blocks the M1 release and Agent-phase entry; evidence, not a plan, is required |
| `M1-CAPACITY` | M1 | The blocking one-gateway load/reconnect envelope and the separate non-blocking capacity observation | The 1,000-socket profile blocks M1; the 2,500-socket result never blocks M1 |
| `M2-AGENT` | M2 | One personal Agent can be attached, used, recovered, and revoked safely | Not an M1 gate; blocks the M2 single-Agent release |

No document may reuse one of these IDs for another purpose or invent a synonymous release gate. Profile slugs name workloads, not additional gates.

A gate status is one of:

- `PASS`: every blocking threshold passed and all required evidence is valid;
- `PASS_WITH_EXCEPTION`: allowed only by §11 and only while the exception is unexpired;
- `FAIL`: a threshold failed;
- `NOT_RUN`: a required command or evidence is absent;
- `STALE`: evidence no longer matches the candidate digest, schema, profile, or validity window.

For M1 release, `M1-CORRECTNESS`, `M1-SECURITY`, `M1-OPS`, and the blocking part of `M1-CAPACITY` must be `PASS`; `M1-UX` must be `PASS` or an allowed `PASS_WITH_EXCEPTION`. `FAIL`, `NOT_RUN`, or `STALE` on any blocking gate fails the release.

## 2. Canonical M1 pilot profile

### 2.1 Topology and availability claim

The M1 pilot is **single-instance recoverable, not highly available**:

```text
browser/load clients
        |
        v
one web instance ----> exactly one API/Socket.IO gateway
                                |
                       one worker instance
                                |
             managed PostgreSQL + managed S3-compatible objects
```

Normative constraints:

- Exactly **one** API/Socket.IO gateway serves the pilot profile. Replica autoscaling is disabled and Redis or an external fan-out broker is absent.
- Web, API, and worker use the same immutable release image digest with role-specific commands.
- PostgreSQL is the transactional truth. Managed object storage holds attachment bytes; public access is blocked and clean objects are versioned.
- Staging and production are isolated. Blocking system, load, restore, and restart evidence comes from production-shaped staging using the production candidate digest and configuration.
- M1 deliberately permits a brief socket interruption during gateway deployment or restart. Clients must recover from durable cursors without a manual refresh.
- M1 proves a **controlled stop/replacement/restart of the sole gateway and automatic resume**. It does not prove uninterrupted service, load-balancer failover, cross-instance fan-out, or a rolling N-1/N deployment.
- Multi-instance rolling deployment and HA belong to a later, separately approved release profile after a measured scaling or availability trigger. That later profile must define at least two gateways, cross-instance fan-out, load-balancer drain, failure-domain placement, N-1/N compatibility, rollback, and its own evidence. It must not be claimed from M1 results.

### 2.2 Frozen resource envelope

Before a release run, the manifest freezes provider SKU, region, limits, PostgreSQL parameters, connection pools, and target configuration. These are minimum target resources; using larger resources is valid only for the documented larger SKU and does not establish capacity on a smaller SKU.

| Component | M1 release-profile envelope |
|---|---|
| API/Socket.IO gateway | Exactly 1 instance; at least 2 vCPU and 2 GiB RAM; explicit CPU/RAM cap; replica autoscaling disabled; bounded socket queue |
| Worker | Exactly 1 instance; at least 1 vCPU and 1 GiB RAM; idempotent PostgreSQL job claims |
| Web | Exactly 1 instance; at least 1 vCPU and 1 GiB RAM |
| PostgreSQL | Managed PostgreSQL; at least 2 vCPU, 4 GiB RAM, and 50 GiB encrypted SSD-equivalent storage; automated backup/PITR; runtime role is non-owner/non-DDL; connection limit recorded |
| Object storage | Managed S3-compatible quarantine and clean buckets; encryption, block-public-access, clean-object versioning, and lifecycle policy enabled |
| Connection budget | API, worker, migration, and operator pools combined remain at or below 70% of the provider connection limit by configuration; measured p95 pool use must meet the gate threshold |
| Load generator | Separate host(s), not co-resident with the target; at least 4 vCPU and 8 GiB RAM in the standard run; exact generator count, CPU, memory, network, and client build recorded |

The target image, target resources, database SKU/settings, pool limits, and application configuration must remain unchanged between the 1,000-socket blocking run and the 2,500-socket observation. Load-generator capacity may be increased only to avoid generator saturation, and that change must be disclosed.

### 2.3 Shared release fixture

Unless a gate states otherwise, production-shaped tests use:

- 100 synthetic tenants with 10 channels each;
- owners, members, non-members, deactivated users, public/private channels, DMs, and membership history;
- three independent devices for selected users;
- deterministic event, attachment, search-canary, and authorization fixtures;
- the immutable candidate image digest and candidate schema/event versions;
- no production data or credentials.

## 3. Recovery objectives and controlled restart

M1 uses two explicitly scoped recovery promises so application correctness is not confused with disaster-recovery infrastructure:

| Promise | Scope | M1 threshold |
|---|---|---|
| Accepted-message durability | API/gateway/worker kill or restart, network interruption, controlled deploy/rollback, PostgreSQL process restart or managed failover that does not invoke PITR, duplicate outbox delivery, and client retry | **Accepted-message RPO = 0:** every command reported accepted remains queryable and replayable; accepted-message loss, duplicate logical application, or order corruption is 0 |
| Pilot disaster recovery | Loss/corruption requiring restoration of PostgreSQL and associated recoverable state into a new isolated environment | **RPO <= 5 minutes; RTO <= 60 minutes** from approved restore start until readiness, integrity checks, and the required smoke suite pass |

The five-minute disaster RPO is not permission for the application to acknowledge uncommitted data. If PITR is invoked, any known accepted command after the selected recovery point must be identified and reconciled by idempotency key and is a severity-1 data-loss incident; it may not be silently treated as normal loss.

For a controlled restart of the sole gateway:

1. readiness is withdrawn and new traffic stops;
2. the process receives its documented graceful termination, then is killed if the grace period is exceeded;
3. the same candidate digest is restarted or replaced as one instance;
4. clients reconnect with jitter, resume from their last applied durable cursor, and retry pending commands with the same idempotency keys;
5. the harness reconciles accepted commands, durable events, client projections, and authorization outcomes.

There is no simultaneous old/new gateway requirement in M1. `pnpm test:rolling-deploy` and any N-1/N HA rehearsal are non-applicable to M1 and must not be used as M1 pass evidence.

## 4. `M1-CORRECTNESS`

| Field | Normative definition |
|---|---|
| Topology | Unit/property and isolated PostgreSQL integration harnesses plus the canonical one-gateway staging profile for process-fault scenarios |
| Resources | Testcontainers resources are recorded for integration runs; staging portions use the frozen envelope in §2.2 |
| Workload | 1,000 same-key retries including 100-way concurrency and timeout retry; 10,000 durable mutations in one channel and concurrent traffic over 20 channels; snapshot/subscription/barrier boundary faults; 100 reconnect cycles × 100 events; unread/mention/thread model runs; five-device convergence; 1,000 outbox crash injections and a 10,000-event backlog |
| Threshold | Exactly one message, logical creation event, and logical audit result per idempotency key; conflicting reuse is rejected; duplicate/missing/inverted committed channel events 0; accepted-before-commit and accepted-for-rollback 0; snapshot/live boundary loss 0; duplicate event application 0; reference-model/projection mismatch 0; read-cursor rollback 0; stale optimistic rows 0; committed events that never publish 0; uncommitted events published 0; 10,000-event backlog drains within 60 seconds after recovery |
| Commands | `pnpm test:correctness`; `pnpm test:integration`; `pnpm test:reliability -- --profile correctness-faults` |
| Evidence | JUnit/JSON summaries; fast-check seeds and shrunk counterexamples; DB message/event/outbox/audit reconciliation; event/cursor transcript for every snapshot/live boundary; process-fault timeline; candidate SHA/digest and schema/event versions |
| Owner/sign-off | Quality owner and Chat Core owner |
| Validity | Same candidate digest and schema/event versions; any relevant code, migration, event-contract, PostgreSQL-major, or idempotency configuration change makes it stale |
| Waiver | None for a blocking threshold |

The snapshot/live test must inject commits before snapshot, between snapshot and subscription, between subscription and its barrier, during every delta page, and at the catch-up/live transition, including duplicate and out-of-order delivery.

## 5. `M1-SECURITY`

| Field | Normative definition |
|---|---|
| Topology | Isolated integration environment and canonical one-gateway staging profile with two tenants, private channels/DMs, search canaries, quarantine/clean buckets, and revocation cases |
| Resources | Frozen target resources for staging; runtime database role is non-owner/non-DDL and storage credentials cannot change bucket policy |
| Workload | At least 500 generated cross-tenant identifier mutations plus the explicit HTTP, WebSocket subscribe/resume, history/delta, search, file, invite, admin, and worker matrix; membership/session revocation; guessed/replayed object URLs; quarantine and EICAR fixtures; secret/config and candidate-image scans |
| Threshold | Unauthorized body/event/object bytes 0; unauthorized writes 0; unauthorized 2xx/subscription success 0; cross-tenant search hit/snippet/count leakage 0; forged cursor success 0; membership revoke blocks new commands/subscriptions within 1 second and later durable delivery to the revoked socket is 0; quarantine/infected download success 0; EICAR release 0; secrets in repository/image/log fixture 0; unapproved fixable critical image vulnerabilities 0 |
| Commands | `pnpm test:isolation`; `pnpm test:tenant-isolation:smoke -- --base-url "$STAGING_BASE_URL"`; `gitleaks detect --no-banner --redact --exit-code 1`; `trivy config --exit-code 1 --severity HIGH,CRITICAL .`; `trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed "$IMAGE"` |
| Evidence | Full attack matrix and generated seed; HTTP/WS transcripts with redacted identifiers; search/file byte assertions; revocation timeline; runtime/migrator role grants; SBOM, image digest, secret-scan and vulnerability reports |
| Owner/sign-off | Security owner and Quality owner |
| Validity | Same candidate digest, dependency lockfile, image base digest, policy/configuration, platform IAM, database grants, and storage policy |
| Waiver | No waiver for isolation, authorization, revocation, secret exposure, quarantine, or critical-vulnerability thresholds. A non-critical vulnerability exception may use §11 only after Security approval and compensating controls |

## 6. `M1-UX`

| Field | Normative definition |
|---|---|
| Topology | Real API, worker, PostgreSQL, object storage, and one gateway; backend routes are not mocked; a deterministic notification provider may be fake |
| Resources | Canonical staging envelope; supported desktop and responsive browser runners are recorded |
| Workload | Invite/login/first message; channel/private channel/DM; send/pending/failure/retry; thread/reaction/edit/delete; unread/mention; file quarantine/download; search and revoke; preferences/hint; admin deactivation; offline/reconnect. Run current Chromium, Firefox, and WebKit at 1440×900; Chromium at 390×844 and 768×1024; keyboard and screen-reader journeys; 20 clean repeats; five-person moderated first-value rehearsal |
| Threshold | Core journeys 100% on all three desktop engines and both responsive viewports; product assertion failures across 20 repeats 0; uncaught browser errors 0; duplicate visible accepted messages 0; axe critical/serious violations 0; keyboard journey completion 100%; keyboard traps/focus loss 0; supported screen-reader run passes; no functional loss at 320 CSS px or 200% zoom; invited-user first accepted message median <=3 minutes and at least 4 of 5 participants complete without help |
| Commands | `pnpm test:e2e`; `pnpm test:a11y` |
| Evidence | JUnit/HTML result; per-engine and viewport matrix; Playwright traces/video/screenshots for failures; axe report; manual keyboard/screen-reader checklist; usability script, participant-level times, assistance, and aggregate result without personal data |
| Owner/sign-off | Product owner, UX owner, and Quality owner |
| Validity | Same candidate digest and user-visible feature flags/configuration; changed affected journey requires rerun, and release manifest must show complete matrix coverage |
| Waiver | Only a criterion-level, non-security, non-durability, non-core-accessibility exception under §11; no blanket gate waiver |

A retry may diagnose infrastructure failure but cannot turn a product assertion failure green. The 20 clean repetitions may run before launch and are not reduced by the first-release bootstrap.

## 7. `M1-OPS`

### 7.1 Managed-platform procurement is a blocking control

The production pilot platform must be selected, purchased/provisioned, and verified before this gate can pass. A recommendation, pricing page, free trial assumption, or intended future upgrade is not evidence.

The procurement record must identify the provider, region, account/project, exact compute and PostgreSQL plans, limits, owner, renewal/cost cap, and verification source for:

- private immutable image-digest pull and role-specific commands;
- WebSocket support, timeout/keepalive limits, graceful termination, readiness, and expected single-instance restart behavior;
- managed PostgreSQL automated backups and PITR granularity capable of RPO <=5 minutes, at least 14 days retention, isolated restore support, encryption, maintenance behavior, and connection limit;
- demonstrated ability to complete the registry's timed restore within RTO <=60 minutes; provider claims alone do not satisfy the timer;
- managed object storage encryption, public-access block, versioning, lifecycle, and current-region/data-residency terms;
- private connectivity or an approved TLS/network boundary, OIDC integration, secret storage, logs/metrics export, support/escalation, and egress limits;
- production/staging isolation and a documented maximum instance count of one for the M1 API gateway.

If the preferred platform cannot meet these controls, the gate stays `FAIL` or `NOT_RUN`; an alternate managed plan or the AWS growth target must be procured and tested before release. Procurement and recovery evidence cannot be waived.

### 7.2 Operational profile

| Field | Normative definition |
|---|---|
| Topology | Canonical one-gateway staging profile, managed production-equivalent services, and a new isolated recovery environment; no in-place restore and no second gateway |
| Resources | Frozen envelope in §2.2; exact purchased production SKUs and backup/PITR settings match or exceed staging evidence and are attached to the manifest |
| Workload | Restore at least 1,000,000 messages, 100 tenants, attachment metadata, and 10 GiB of objects to a new environment; verify row counts/checksums, last accepted IDs/cursors, authorization canaries, sampled objects, login/history/resume/new send. Separately run controlled sole-gateway restart under 1,000 sockets and 100 commands/s, worker restart, dropped notification, and PostgreSQL restart/failover without PITR |
| Threshold | Disaster RPO <=5 minutes and RTO <=60 minutes; tenant/checksum mismatch 0; missing/corrupt sampled objects 0/1,000; post-restore sequence/ID collision 0; accepted-message loss under non-PITR controlled faults 0; logical duplicate application/order inversion/unauthorized event 0; 95% of clients resume <=15 seconds, 99% <=30 seconds, all <=60 seconds from gateway restart initiation; manual refresh clients 0; readiness and alert/runbook checks pass |
| Commands | `pnpm test:restore -- --profile pilot-recovery`; `pnpm db:integrity:check -- --environment recovery`; `pnpm storage:reconcile -- --environment recovery --dry-run`; `pnpm test:smoke -- --base-url "$RECOVERY_BASE_URL"`; `pnpm test:ws-resume -- --base-url "$RECOVERY_BASE_URL"`; `pnpm test:reliability -- --profile controlled-single-gateway-restart`; `pnpm db:migrate:test-empty`; from the second release onward, `pnpm db:migrate:test-upgrade` |
| Evidence | Approved procurement record; provider configuration export/screenshots or API output without secrets; backup IDs and PITR target; restore start/ready/smoke timestamps; row and seeded checksums; object sample report; restart/readiness/client-cursor timeline; migration report; dashboard/alert test; runbook tabletop; on-call and rollback owner |
| Owner/sign-off | Operations owner, Quality owner, and release owner; Security signs platform IAM/storage controls |
| Validity | Procurement evidence remains valid only while provider plan/terms and configured controls are unchanged. Restore evidence is at most 30 days old and must match the candidate schema/migrations; every schema migration release reruns it. Restart evidence matches the candidate digest and runtime configuration |
| Waiver | None for procurement, RPO/RTO, accepted-message durability, restore integrity, controlled restart/resume, or required evidence |

Operations evidence is a hard Agent-phase boundary. `M1-OPS` is not passed by authored runbooks, enabled backup settings, or a provider SLA alone; the timed restore and controlled restart/resume must have actually run and produced retained evidence.

## 8. `M1-CAPACITY`

`M1-CAPACITY` contains two named workload profiles. They share one gate ID because only the pilot profile makes the release decision.

### 8.1 Blocking profile: `pilot-one-gateway-1000`

| Dimension | Definition |
|---|---|
| Topology/resources | Canonical M1 topology and frozen resources; exactly one API/Socket.IO gateway |
| Data/clients | 100 tenants × 10 channels; 1,000 authenticated concurrent sockets; 20% active users; one noisy tenant generates 30% of traffic |
| Traffic | Total 100 commands/s; create 70%, reaction 10%, read cursor 10%, edit 5%, thread 5%; message body p50 200 B and p95 4 KiB; 1% attachment-metadata events |
| Duration | 10-minute ramp, 2-hour steady release run, 5-minute cool-down |
| Fault phases | All 1,000 sockets disconnect within a 10-second window while 100 commands/s continues and the sole gateway is restarted; slow-client queue and 10,000-event burst are also exercised |
| Blocking thresholds | Commit p95 <=300 ms and p99 <=750 ms; online fan-out p95 <=1 s and p99 <=2 s; unexpected command error rate <0.1%; unexpected socket disconnect <0.5% per hour; accepted loss and unauthorized fan-out 0; PostgreSQL and gateway CPU p95 <=80%; DB pool p95 <=80%; outbox oldest age p95 <=5 s; noisy-tenant impact on others <=25% over baseline; gateway RSS growth trend <=50 MiB/hour over the final 60 minutes; OOM/unplanned restart 0; reconnect 95% <=15 s, 99% <=30 s, 100% <=60 s; slow-client queue never exceeds 1,000 events or 5 MiB and closes resumably within 5 seconds |
| Command | `pnpm test:load -- --profile pilot-one-gateway-1000` |
| Evidence | Raw k6/Node summary, latency histograms, per-tenant comparison, socket/cursor reconciliation, target and generator resources, PostgreSQL settings, pool metrics, CPU/RSS/outbox dashboards, fault timeline, image/config digest |

Every blocking threshold must pass. This profile, not the 2,500-socket observation, is the M1 release criterion.

### 8.2 Non-blocking result: `capacity-one-gateway-2500`

Run against the **unchanged** candidate image, target resources, database plan/settings, pool limits, and one-gateway topology used by the blocking profile:

- 2,500 concurrent authenticated sockets;
- the same tenant/channel distribution, operation mix, payload distribution, and 100 commands/s steady total rate;
- 10-minute ramp, 30-minute steady period, a 5-minute 200 commands/s burst, and 5-minute cool-down;
- capture the same latency, error, disconnect, CPU, memory, pool, outbox, and noisy-neighbor metrics.

The report evaluates the same latency/error objectives and records the first saturation signal, maximum stable sockets, and recommended next action, but its state is informational: `met_objectives`, `below_objectives`, or `not_run`. A failure, saturation, or absent run **does not fail M1**, does not require a waiver, and must not be relabeled as a blocking failure. The release manifest must carry the state explicitly rather than omit the profile. It may trigger vertical tuning, a lower documented operating cap, or work on the later multi-instance profile.

Canonical command:

```bash
pnpm test:load -- --profile capacity-one-gateway-2500
```

`M1-CAPACITY` validity is tied to the exact candidate digest, target resources, database/configuration, workload implementation, and load-generator version. Its blocking 1,000-socket evidence is non-waivable.

## 9. `M2-AGENT`

### 9.1 Entry boundary

Agent implementation may enter the active release phase only when:

1. `M1-CORRECTNESS`, `M1-SECURITY`, `M1-OPS`, and the blocking portion of `M1-CAPACITY` are current `PASS` results;
2. `M1-UX` is `PASS` or has a valid criterion-level exception;
3. the M1 release manifest links the actual managed-platform procurement, timed restore, and controlled restart/resume evidence; and
4. there is no open severity-1 incident involving isolation, accepted-message loss/corruption, or backup/PITR failure.

In particular, Operations evidence blocks Agent work even if all Chat tests are green. A planned restore, unpurchased qualifying plan, missing evidence, or expired restore result keeps the Agent phase blocked.

### 9.2 Single-Agent release profile

| Field | Normative definition |
|---|---|
| Topology | The canonical M1 one-gateway Chat Core plus one outbound-only local Connector and one `service` principal; no inbound user-machine port, orchestration, shared memory, or multi-Agent fan-out |
| Resources | M1 target envelope plus a supported clean Connector host/OS; connector CPU/RAM, installer signature/notarization, client and adapter versions are recorded |
| Workload | Create Agent; six-digit single-use pairing confirmation backed by high-entropy device credential and proof of possession; select allowlisted channel; mention; stream; final/interrupted durable message; cancel; Connector restart/reconnect/catch-up; credential/session replay and wrong-tenant/channel tests; revoke during idle, stream, and command; vendor-adapter failure; 20 onboarding sessions |
| Threshold | Median install-to-online <=5 minutes; at least 16/20 users succeed without help and at least 19/20 with documented guidance; static installer/shell history enrollment secrets 0; cloud raw filesystem paths 0; inbound ports opened 0; duplicate Agent identities/messages 0; Connector restart retains the same Agent identity; revoke blocks new commands immediately and wrong-tenant/channel/replayed credential success is 0; finalized or interrupted durable message count is exactly one per run; vendor failure causes human-chat commit, outbox, or recovery failure 0 |
| Commands | `pnpm test:agent -- --profile single-personal-agent`; `pnpm test:agent-security`; `pnpm test:agent-onboarding` |
| Evidence | Pairing/revoke protocol transcript with secrets redacted; connector conformance/security report; channel/credential scope matrix; final-message reconciliation; installer signature/notarization and health-check result; participant-level onboarding times and assistance; human-chat fault-isolation report |
| Owner/sign-off | Agent owner, Security owner, Product/UX owner, Quality owner, and release owner |
| Validity | Same M2 candidate digest, Connector/installer digest, adapter version, supported OS, platform policy, and channel-scope configuration |
| Waiver | No waiver for secret handling, identity, tenant/channel scope, revoke, outbound-only networking, durable final-message semantics, or human-chat isolation. A non-security UX exception may use §11 |

An M2 release must pass `M2-AGENT` and revalidate all M1 blocking gates against the M2 server candidate. Stable procurement evidence may be reused only while its §7 validity conditions hold; operational tests affected by a schema, runtime, or deployment change must be rerun.

## 10. Evidence manifest and command contract

### 10.1 Release manifest

The release decision uses one immutable manifest. At minimum it contains:

- release ID, milestone, decision time, release owner, Git SHA, clean-tree result, image digest, SBOM digest, migration version, event-schema version, and feature flags;
- every gate ID exactly once with status, profile, commands, exit codes, start/end timestamps, artifact URIs and checksums, threshold results, owners, and approvals;
- provider/region/SKU, topology, instance counts, CPU/RAM/storage/network caps, PostgreSQL version/settings, connection limits/pools, object controls, and load-generator resources;
- the blocking `pilot-one-gateway-1000` result and a separate explicit `capacity-one-gateway-2500` informational state;
- restore backup ID/PITR target/RPO/RTO, restart timeline, and accepted-message/cursor reconciliation;
- exception records and expiry, if any;
- a final machine-derived decision. A human may reject a machine pass but may not convert a missing or failed non-waivable result to pass.

Raw artifacts include JUnit/JSON/HTML, seeds, Playwright/axe reports, k6 raw summaries, metrics exports, process/fault timelines, checksums, provider configuration evidence, and review approvals. Secrets, message bodies, credentials, and presigned URLs must be redacted.

### 10.2 Canonical command behavior

The commands in this registry are the root-script contract when their owning capabilities land. Each required command must:

- exercise the behavior named by its profile rather than a mock/no-op placeholder;
- exit non-zero on a failed blocking threshold or missing required fixture;
- emit machine-readable threshold results and artifact locations;
- record seed, candidate digest, schema/config, topology, and resource envelope;
- classify infrastructure errors separately without retrying product assertions to green.

The first release may add commands incrementally with their owning implementation cards, but a gate cannot pass until every command required for that release exists and performs real assertions. A missing command is `NOT_RUN`; a passing placeholder is invalid evidence.

The final aggregator is:

```bash
pnpm test:quality-gate -- --manifest "$RELEASE_MANIFEST"
```

It validates evidence and computes status; it does not rerun or substitute for the underlying suites.

## 11. Waiver and exception policy

Non-waivable:

- every blocking threshold in `M1-CORRECTNESS`;
- tenant/channel isolation, authorization, revocation, secret, quarantine, and critical-vulnerability thresholds in `M1-SECURITY`;
- managed-platform procurement, backup/PITR, RPO/RTO, restore integrity, accepted-message RPO=0, and controlled restart/resume in `M1-OPS`;
- the blocking 1,000-socket profile in `M1-CAPACITY`;
- message loss/order/corruption, unauthorized access, or any active severity-1 condition in any gate;
- the security/durability requirements marked non-waivable in `M2-AGENT`.

The 2,500-socket result is non-blocking and needs no waiver.

An eligible UX or non-critical vulnerability exception must include:

1. exact gate and criterion/threshold, failed or missing evidence, and user/security/operational impact;
2. rationale, compensating control, reduced scope or operating limit, monitoring, rollback/disable action, and a linked remediation issue;
3. accountable owner plus Product, Quality, Operations, and Security approval where relevant;
4. approval and expiry timestamps, with expiry no later than 14 days and never beyond the next release;
5. an explicit statement that it does not weaken a non-waivable condition.

Exceptions do not silently renew. Expiry changes the gate to `FAIL`. A broad statement such as “pilot risk accepted” is invalid. Operations evidence cannot be converted to `PASS_WITH_EXCEPTION`, and an exception cannot unblock Agent-phase entry when `M1-OPS` is not `PASS`.

## 12. First-release bootstrap

Historical controls cannot have a production history before the first release. The following bootstrap is the complete allowed substitution; it is a profile rule, not a waiver, and it does not reduce any correctness, security, UX, load, RPO/RTO, procurement, or restart threshold.

| Historical control | First-release evidence | When the steady-state rule activates |
|---|---|---|
| Last 30 scheduled backup jobs are 30/30 successful | At least 7 consecutive scheduled production-shaped staging backup/PITR points with no failure, plus the two isolated restores below; production backup monitoring is enabled and test-alert received before launch | As soon as 30 scheduled production jobs exist, the rolling last-30 result must be 30/30 for later releases and continuing Agent-phase eligibility |
| Monthly restore history | Two isolated restores using the candidate schema and procured plan: one latest recovery point and one independently selected PITR point; at least one is the full timed 1,000,000-message/10-GiB drill and both pass integrity/security smoke | Monthly after launch and on every schema-migration release; evidence expires after 30 days |
| 28-day production SLO history | Mark SLO attainment `provisional—not yet measurable`; pass synthetic/load/restart/restore gates, enable production SLIs and paging, and receive test alerts | On day 28, and for every later release, attach the rolling 28-day SLO/error-budget report; any Sev-1 condition blocks regardless of elapsed days |
| Prior production schema/digest for upgrade or rollback | Run empty-database migration, migration idempotence/status, two deployments of the candidate digest, controlled restart/resume, and application stop/forward-fix tabletop; mark prior-version upgrade `not_applicable:first_release` with owner approval | Starting with the second release, test upgrade from the immediately previous production schema and retain the previous digest according to the rollback policy |

The two-hour 1,000-socket load run, 20 clean browser repetitions, actual platform purchase/provisioning, timed restore, controlled gateway restart, and all non-historical tests remain mandatory for the first release.

The bootstrap must be completed before `M1-OPS` passes and therefore before Agent-phase entry. If any bootstrap run fails, fix the cause and repeat the affected sequence; do not omit failed evidence or count ad hoc manual snapshots as scheduled jobs.

## 13. Final milestone decisions

- **M1 release:** the five M1 gate IDs satisfy §1 using the canonical single-gateway profile. The product may claim recoverability and the measured 1,000-socket envelope. It must not claim HA or multi-instance rolling deployment. The 2,500-socket outcome is capacity information only.
- **Agent-phase start:** the M1 decision remains valid and `M1-OPS` includes real, current procurement, restore, and controlled restart/resume evidence. Operations evidence blocks this transition.
- **M2 release:** all applicable M1 gates are revalidated for the M2 candidate and `M2-AGENT` passes. Shared Mind, product Kanban, Orchestrator, autonomous multi-Agent fan-out, and multi-instance HA remain outside this registry's approved release scope.
