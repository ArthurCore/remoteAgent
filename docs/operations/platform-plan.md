# Chat Core Platform and Operations Plan

**Card:** AW-005  
**Scope:** clean-room Chat Core through the 10–50-person, single-organization pilot and an AWS growth path  
**Source policy:** `docs/security/source-and-provenance-policy.md` controls. Agent Workspace 제품 소스는 승인된 private hosted Git/CI를 사용할 수 있다. 고객 repository 내용·경로와 vendor credentials가 local-by-default인 경계와 혼동하지 않는다.

> **Release authority:** `docs/quality/release-profile-registry.md` controls M1 topology, 1,000/2,500 socket profiles, RPO/RTO, controlled restart, procurement evidence, and Agent-phase entry.

## 1. Outcomes and principles

This plan provides a low-operations path for the TypeScript modular monolith described in the product direction:

- `web`: Next.js web application.
- `api`: NestJS/Fastify HTTP and Socket.IO gateway.
- `worker`: PostgreSQL transactional-outbox relay and asynchronous jobs.
- PostgreSQL: system of record, initial queue, and initial full-text search.
- S3-compatible object storage: quarantine and authorized attachment storage.

Operational decisions:

1. **Start with containers, not a cluster platform.** Docker Compose is the local contract; the pilot uses managed application containers, PostgreSQL, and object storage. Do not introduce Kubernetes, Kafka, a service mesh, or a separate streaming platform.
2. **Keep PostgreSQL authoritative.** A Socket.IO ACK is not durable acceptance. `message.accepted` is emitted only after the message, audit record, and outbox event commit.
3. **Run one API gateway in the pilot.** This preserves simple in-process fan-out and avoids Redis. Reconnect/cursor resume is required, so an API restart is recoverable. Scale vertically first.
4. **Separate build from run.** The same immutable OCI image digest is promoted from staging to production. Runtime services receive images, not a source checkout. Approved private hosted Git/CI may process product source under the source policy.
5. **Prefer managed state.** Do not run PostgreSQL, object storage, or an observability database on a general-purpose VM in the pilot.
6. **Automate repeatable operations, but keep the stack understandable.** Every deploy, migration, backup restore, and rollback has a command, an owner, and retained evidence.
7. **Portability is a contract, not lowest-common-denominator architecture.** Use PostgreSQL, S3 API, OIDC, OpenTelemetry, standard HTTP/WebSocket, OCI images, environment variables, and DNS/TLS boundaries.

## 2. Environment model

| Environment | Purpose | Data | Availability | Deployment |
|---|---|---|---|---|
| Local | Development and integration | Synthetic, disposable | Best effort | Docker Compose plus `pnpm` |
| CI | Reproducible quality gate in a clean checkout | Generated fixtures only | Per run | Ephemeral Compose/Testcontainers |
| Staging | Production-like release and restore rehearsal | Synthetic; never copied production rows | Business-hours best effort | Same image digest and migration path as production |
| Production pilot | One organization, 10–50 people | Customer data | Pilot SLOs below | Managed application services, PostgreSQL, object storage |

Hard isolation rules:

- Separate database instances (not only schemas), object-storage buckets, credentials, OIDC clients, encryption keys, and DNS names for staging and production.
- No production credentials in local or CI environments.
- Never clone production data into staging. If a production-shaped fixture is required, generate or irreversibly synthesize it.
- Name resources with `chatcore-{environment}-{component}` and attach `environment`, `service`, `owner`, and `cost-center` tags/labels.

## 3. Local Docker development

### 3.1 Compose contract

AW-007 should create `docker-compose.yml` with these required services:

| Service | Required image/build | Purpose | Persistent locally? |
|---|---|---|---|
| `postgres` | Pinned PostgreSQL major and patch-compatible tag | system of record | Named volume |
| `rustfs` | Pinned `rustfs/rustfs` digest | Maintained S3-compatible local object store | Named volume |
| `storage-init` | Application runtime image, one-shot command | Idempotently wait for S3 and create quarantine/clean buckets | No |
| `api` | Repository Dockerfile target | HTTP/Socket.IO | No |
| `worker` | Same runtime image, different command | outbox/jobs | No |
| `web` | Repository Dockerfile target | browser UI | No |

Optional profiles may add `mailpit` for email inspection and `otel-collector` for observability development. Malware scanning can use a local scanner profile when attachment work begins; uploads must remain `quarantined` until a scanner marks them clean. MinIO Community is not a new-project baseline because its upstream repository is archived; RustFS is local compatibility infrastructure, not the production recommendation.

Compose requirements:

- Pin image major versions; production images are pinned by digest.
- Add health checks for PostgreSQL, API/worker `/health/ready`, web, and the RustFS-backed bucket initialization path.
- Use `depends_on: condition: service_healthy` only for local startup convenience; application code still retries dependencies with bounded exponential backoff.
- Bind stateful ports to `127.0.0.1`, not all interfaces.
- Run application containers as a non-root UID, use a read-only root filesystem where practical, and mount only explicit temporary directories.
- Keep `.env.example` non-secret and commit it. Keep `.env.local` ignored with mode `0600`.
- Provide separate `DATABASE_URL_MIGRATOR` and `DATABASE_URL_RUNTIME`; the runtime role must not own tables or have DDL permission.

Suggested developer contract (to be implemented by AW-007):

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local

scripts/compose.sh up -d postgres rustfs storage-init
scripts/compose.sh ps
pnpm db:migrate
pnpm dev
```

A fully containerized smoke run must also work:

```bash
docker compose build --pull

docker compose up -d --wait
curl --fail --silent http://127.0.0.1:3001/health/live
curl --fail --silent http://127.0.0.1:3001/health/ready
curl --fail --silent http://127.0.0.1:3000/
docker compose logs --no-color --since=5m api worker web
docker compose down
```

The gate fails on a non-zero command, an unhealthy container, a migration error, or log matches for unhandled rejection/panic/fatal. Destructive reset must be explicit:

```bash
docker compose down --volumes --remove-orphans
```

### 3.2 Runtime configuration

Validate configuration on process startup and fail closed. At minimum:

- `APP_ENV`, `APP_VERSION`, `PORT`, `PUBLIC_BASE_URL`
- `DATABASE_URL` (runtime), and a migration-only URL outside normal process environments
- `S3_ENDPOINT` (optional for AWS), `S3_REGION`, `S3_QUARANTINE_BUCKET`, `S3_CLEAN_BUCKET`
- workload identity or access-key variables for local-only S3 compatibility
- OIDC issuer/client settings
- session/cookie signing key reference
- OpenTelemetry endpoint and sampling controls
- log level and release identifier

Production must reject development defaults, wildcard origins, insecure cookies, unknown OIDC issuers, missing TLS-aware proxy settings, and buckets whose names do not match the environment.

## 4. CI and release evidence

### 4.1 Provider-neutral clean-checkout CI

The authoritative pipeline is the repository-owned `pnpm ci` contract executed from a clean checkout. It may run in an approved private hosted CI organization or in the optional source-local runner profile from the source policy. It must not use a developer's dirty working tree, `.env.local`, customer repository material, customer vendor credentials, or production data.

A release is prohibited unless the selected approved runner records:

- commit SHA and clean-tree assertion;
- Node, pnpm, Docker, and PostgreSQL versions;
- command results and test reports;
- image digest, SBOM, vulnerability report, and provenance attestation;
- migration plan/check result;
- signer identity and timestamp.

The gate must not depend on provider-only test behavior. Hosted and optional source-local runners execute the same repository commands.

Clean-checkout preflight:

```bash
test -z "$(git status --porcelain)"
git rev-parse HEAD
node --version
pnpm --version
docker version
```

### 4.2 Required pipeline gates

The single `pnpm ci` entry point should run these stages in order:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm boundaries:check
pnpm contracts:check
pnpm test:unit
pnpm test:integration
pnpm db:migrate:check
pnpm build
pnpm test:e2e
pnpm test:tenant-isolation
```

Additional container gates:

```bash
export IMAGE="chatcore:${GIT_SHA:-$(git rev-parse --short=12 HEAD)}"
docker buildx build --pull --load --tag "$IMAGE" .
docker inspect "$IMAGE" --format '{{.Config.User}}'
docker run --rm --entrypoint node "$IMAGE" --version

# Examples; pin approved tool versions in the CI image.
trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed "$IMAGE"
syft "$IMAGE" -o cyclonedx-json > sbom.cdx.json
```

Image acceptance:

- multi-stage runtime image contains compiled runtime output and production dependencies only;
- no source checkout, `.git`, test fixtures, package-manager cache, `.env*`, keys, or token files;
- non-root `USER`, explicit health endpoint, OCI revision/source-policy labels;
- zero unapproved fixable critical vulnerabilities; high vulnerabilities require a recorded owner and expiry;
- SBOM and test evidence are retained with the release.

Run migration compatibility against both an empty database and a snapshot of the previous schema:

```bash
# Names are a required package-script contract, not commands that exist before AW-007/AW-008.
pnpm db:migrate:test-empty
pnpm db:migrate:test-upgrade
pnpm db:schema:assert-clean
```

Nightly or pre-release, rather than on every edit:

```bash
pnpm test:correctness       # 1,000 idempotent retries; zero duplicate messages
pnpm test:realtime          # reconnect/resume, slow client, restart
pnpm test:load              # 1,000 sockets; p95 commit <=300 ms, fan-out <=1 s
pnpm test:restore           # restore latest staged backup and run smoke suite
```

The quality thresholds from the product direction are release blockers, not aspirational dashboards.

### 4.3 Artifact publication and promotion

The runner builds a runtime-only OCI image and pushes it over TLS to a private registry. Prefer AWS ECR when the selected platform can pull from it; otherwise use a dedicated private registry with short-lived credentials. Never embed registry credentials in the image.

```bash
# Example ECR publication from the trusted local runner.
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
AWS_REGION="ap-northeast-2"
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
REPOSITORY="chatcore"
TAG="$(git rev-parse HEAD)"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
docker tag "$IMAGE" "$REGISTRY/$REPOSITORY:$TAG"
docker push "$REGISTRY/$REPOSITORY:$TAG"
DIGEST="$(aws ecr describe-images --region "$AWS_REGION" --repository-name "$REPOSITORY" \
  --image-ids imageTag="$TAG" --query 'imageDetails[0].imageDigest' --output text)"
test "$DIGEST" != "None"
printf '%s@%s\n' "$REGISTRY/$REPOSITORY" "$DIGEST"
```

Sign the digest with the organization's approved keyless or KMS-backed process when available. Deploy by digest, never by mutable `latest`. Staging receives the digest first. Production promotion uses the exact same digest after staging gates pass.

## 5. Recommended managed-cloud pilot

### 5.1 Recommendation

Use a **Render-style managed container platform** for the pilot (Render is the default recommendation), with:

- one managed `web` service;
- one managed `api` service with WebSocket support;
- one managed private `worker` service;
- managed PostgreSQL with automated backups and point-in-time recovery if the selected plan supports the required RPO;
- Cloudflare R2 or AWS S3 for S3-compatible quarantine/clean attachment buckets;
- provider-managed TLS and DNS integration;
- an external managed observability service or OpenTelemetry endpoint.

Before purchase, verify the chosen plan's current private-registry pull, WebSocket timeout, deployment overlap, PostgreSQL backup/PITR, region, data residency, egress, log retention, and support terms. These are procurement gates because platform features and limits change.

Why this pilot:

- no VM patching, load-balancer administration, PostgreSQL maintenance, or Kubernetes operations;
- three processes can share one immutable image with separate commands;
- it remains close to the Docker/environment-variable contract;
- it is sufficient for one organization and 10–50 users;
- migration to ECS/RDS/S3 changes deployment wiring, not domain code.

Known pilot trade-off: a single API instance can briefly disconnect sockets during deploy/restart. Clients must reconnect and resume from durable channel cursors. If the provider cannot overlap old/new API instances safely, schedule production deploys and publish a maintenance notice until growth architecture is justified.

### 5.2 Pilot topology and sizing policy

Start with:

- API: one instance, at least 1 GiB memory, vertical autoscaling disabled; set an explicit maximum size.
- Worker: one small instance; jobs are idempotent and claimed with PostgreSQL locking.
- Web: one small instance.
- PostgreSQL: managed, encrypted, private connectivity where supported; storage and connection alerts enabled.
- Object storage: two buckets/prefix boundaries (`quarantine`, `clean`) with public access blocked and lifecycle rules.

Do not put attachments on an application filesystem. Do not use provider disk as a database. Do not add Redis merely for presence; presence/typing is ephemeral and one gateway is enough. Use a bounded PostgreSQL connection pool so total connections across API, worker, migrations, and operator access remain below 70% of the database limit.

### 5.3 Staging deploy gate

Deployment ordering:

1. Verify image digest, signature/provenance, SBOM, and CI evidence.
2. Acquire a deployment lock so only one release/migration proceeds.
3. Run the migration as a one-off job using the migration role.
4. Deploy worker, API, then web by digest. Keep workers backward-compatible during rolling change.
5. Wait for `/health/ready`; run HTTP, WebSocket resume, attachment authorization, and cross-tenant negative smoke tests.
6. Observe errors, latency, database locks, and outbox lag for at least 15 minutes.
7. Mark the digest eligible for production.

Example provider-neutral smoke contract:

```bash
BASE_URL="https://staging.example.invalid"
curl --fail --silent --show-error "$BASE_URL/health/live"
curl --fail --silent --show-error "$BASE_URL/health/ready"
pnpm test:smoke -- --base-url "$BASE_URL"
pnpm test:ws-resume -- --base-url "$BASE_URL"
pnpm test:tenant-isolation:smoke -- --base-url "$BASE_URL"
```

Health semantics:

- `/health/live`: event loop/process is alive; it must not fail merely because PostgreSQL is briefly unavailable.
- `/health/ready`: process can serve new work and required dependencies/configuration are valid.
- Neither endpoint exposes versions, connection strings, stack traces, tenant data, or secret metadata publicly.

### 5.4 Production deploy and rollback gate

Production requires an approved change record containing image digest, migration ID, backup status, dashboards, owner, and rollback/forward-fix decision.

Pre-deploy checks:

```bash
curl --fail --silent https://chat.example.invalid/health/ready
pnpm db:migrate:status -- --environment production
# Provider-specific command must prove the latest successful backup/PITR point is within the RPO.
```

Release gates:

- no active severity-1/2 incident;
- last staging run uses the same digest and passed;
- latest recoverable point is within RPO;
- migration lock and statement/lock timeouts are configured;
- at least one operator is available through the observation window;
- rollback target digest is recorded.

After deploy, execute synthetic sign-in/invite where safe, message creation, thread/reaction, reconnect/resume, search authorization, attachment upload/download authorization, and audit-event checks. Confirm outbox lag returns to baseline. Retain the prior digest until the observation period ends.

**Rollback rule:** application-only releases may roll back to the previous digest. Database changes are forward-only and expansion/contraction compatible; never automatically run a destructive down migration in production. If a new schema is incompatible, stop and forward-fix or restore under the data-loss incident procedure.

## 6. AWS growth path

Move when measured demand or enterprise requirements justify it, not on a calendar date. Triggers include one or more of:

- the pilot platform cannot meet SLO/error-budget goals or contractual residency/network controls;
- single API vertical limits are approached (sustained >60% CPU or >70% memory during busy hour after tuning);
- more than one API replica is required and reconnect load is material;
- database size/IOPS, backup RPO/RTO, or observability needs exceed pilot plans;
- managed-platform unit cost exceeds the reviewed AWS forecast for three consecutive months.

Recommended AWS target in `ap-northeast-2` unless customer/data-residency requirements dictate otherwise:

- ECR: immutable OCI images, enhanced scanning, lifecycle retention.
- ECS Fargate: separate `web`, `api`, and `worker` services from one image digest.
- Application Load Balancer: HTTP and WebSocket routing; deregistration delay aligned with graceful shutdown.
- RDS PostgreSQL: Multi-AZ, encryption, automated backups/PITR, Performance Insights or current equivalent.
- S3: separate quarantine and clean buckets, block public access, SSE-KMS where required, versioning and lifecycle policies.
- Secrets Manager and task IAM roles: no static AWS keys in containers.
- Route 53 and ACM: DNS and TLS.
- CloudWatch plus OpenTelemetry collector/export: logs, metrics, alarms, and traces.
- AWS Backup or explicit RDS/S3 policies as applicable; cross-account backup copy after commercial need is confirmed.
- Infrastructure as code using Terraform or AWS CDK, with reviewed plans and separate staging/production state/accounts.

Use separate AWS accounts for production and non-production when entering the growth phase. Apply SCP/permission boundaries through the organization's AWS governance, not application code.

Initial growth topology: two API tasks across availability zones, two web tasks, one worker task with fast replacement, and RDS Multi-AZ. At that point, introduce a measured cross-instance fan-out solution. Prefer a small Redis-compatible managed service only if Socket.IO adapter semantics and load tests prove it necessary. Keep durable catch-up in PostgreSQL.

Use SQS only when PostgreSQL outbox evidence shows sustained lag/contention that cannot be solved by indexing, batching, or another worker. The outbox remains the atomic publication boundary. Kafka is not justified for this product stage.

Explicitly deferred:

- EKS/Kubernetes;
- Kafka/MSK;
- service mesh;
- multi-region active/active PostgreSQL;
- self-managed databases on EC2;
- Redis before horizontal gateway scaling is measured;
- Elasticsearch/OpenSearch before PostgreSQL FTS limits are demonstrated.

## 7. Secrets, identity, and access

### 7.1 Secret storage

| Location | Mechanism | Rules |
|---|---|---|
| Local | ignored `.env.local`, OS keychain for personal credentials | mode `0600`; synthetic credentials only |
| Trusted CI runner | OS keychain/key store or short-lived workload credentials | no production application secrets; release role is push-only |
| Pilot | managed platform secret/environment store | per-environment, least privilege, masked from logs |
| AWS | Secrets Manager, KMS, ECS task IAM roles | workload identity preferred; no static AWS keys |
| Local Agent Connector (Milestone 2) | user OS keychain/secure credential store | never synchronized into Chat Core environment variables |

Do not place secrets in Git, Compose YAML, Docker build args, image layers, SBOMs, logs, crash reports, ticket text, or chat messages. Secret names may be logged; values and hashes must not.

Automated checks:

```bash
gitleaks detect --no-banner --redact --exit-code 1
trivy config --exit-code 1 --severity HIGH,CRITICAL .
```

### 7.2 Least privilege and rotation

Use distinct identities for runtime read/write, migrator DDL, backup/restore, observability ingestion, deployment, and human break-glass access. The runtime PostgreSQL role is not the database owner and cannot create/alter/drop objects. Bucket access is prefix/bucket scoped; API may issue short-lived authorized URLs but cannot change bucket policy.

Rotation targets:

- sessions/signing keys: support current and previous key during a bounded overlap; rotate at least every 90 days and immediately after suspected exposure;
- database credentials: rotate at least every 90 days where workload identity is unavailable;
- OIDC client secrets and provider API keys: every 90 days or provider-required interval;
- break-glass credentials: after each use and at least quarterly validation;
- TLS certificates: provider-managed renewal with expiry alert at 30/14/7 days.

Every rotation is rehearsed in staging and verified with new sessions plus revocation/expiry of old credentials. Access reviews are quarterly and on personnel changes. Production console access requires MFA and audited named users; no shared admin accounts.

## 8. Database migrations

Migrations are immutable, ordered, and checked into `packages/db`. Use expand/migrate/contract:

1. **Expand:** add nullable columns/tables/indexes compatible with current and next code.
2. **Migrate/backfill:** process bounded batches from the worker or one-off job; emit progress and allow resume.
3. **Switch:** deploy code reading/writing the new representation.
4. **Contract:** remove old representation in a later release only after telemetry proves no old code uses it and rollback window has elapsed.

Rules:

- one migration runner under a PostgreSQL advisory lock;
- explicit `lock_timeout` and `statement_timeout`; do not wait indefinitely;
- use concurrent index creation where supported and safe; understand transaction restrictions;
- estimate table rewrites/lock impact in staging using production-shaped synthetic volume;
- migrations do not enqueue external side effects;
- no destructive migration in the same release that stops reading the old field;
- take/verify a recoverable point before a risky production migration;
- application deploys tolerate both old and expanded schemas.

Required evidence:

```bash
pnpm db:migrate:test-empty
pnpm db:migrate:test-upgrade
pnpm db:migrate:status -- --environment staging
pnpm db:schema:assert-clean
```

A migration is blocked if it requires an unbounded exclusive lock, lacks a tested restart path, exceeds the staging time budget, or cannot coexist with the previous application digest.

## 9. Observability

### 9.1 Structured logs

Emit one JSON object per line to stdout/stderr. Required common fields:

- timestamp, severity, service, environment, release/image digest;
- trace ID, span ID, request/command ID, idempotency-key fingerprint (never raw key);
- tenant/workspace/channel/user identifiers as non-reversible operational IDs only where needed;
- route/operation, status, duration, error class, retry count;
- WebSocket connection event and resume outcome;
- outbox job type, age, attempt, result.

Never log message bodies, attachment contents/names if sensitive, authorization/cookie headers, presigned URLs, access/refresh tokens, pairing codes, database URLs, or full request payloads. Add automated redaction tests and periodically inject canary secret patterns in staging to ensure they do not reach log search.

Retention: staging 7–14 days; pilot production 30 days for application logs and at least the legally/product-required period for immutable audit records stored separately. Set a daily ingestion cap and alert before logs are dropped.

### 9.2 Metrics

Use OpenTelemetry and Prometheus-compatible metric names where practical. Minimum dashboards:

- HTTP request rate, error rate, p50/p95/p99 duration by normalized route;
- message commit p50/p95/p99 and accepted/error counts;
- fan-out latency and WebSocket active connections, reconnect rate, resume success/failure;
- slow-client disconnects and bounded queue saturation;
- outbox oldest age, pending count, attempts, dead-letter/final failure count;
- PostgreSQL CPU, storage, connections, lock waits, transaction duration, query latency, replication/PITR health;
- object upload/scan failure, quarantine age, authorized download denial;
- worker throughput/failure;
- process CPU/memory/restarts and container readiness;
- OIDC login failure/session refresh/revocation outcomes;
- per-tenant usage counters for noisy-neighbor detection, without high-cardinality labels on every metric.

Do not use raw tenant/channel/user/message IDs as metric labels. Put high-cardinality context in sampled traces/logs.

### 9.3 Traces

Propagate W3C Trace Context through HTTP, Socket.IO command handling, database calls, outbox publication, worker jobs, and object-storage operations. Trace the command through durable commit and fan-out as linked spans. Default to head sampling (for example, 5–10%), retain all errors and selected high-latency traces via tail sampling if the provider supports it. Never attach message content or credentials to spans.

## 10. SLOs, error budgets, and alerts

### 10.1 Pilot SLOs

Measure over a rolling 28-day window, excluding only announced maintenance agreed with the pilot customer:

| User journey / SLI | Pilot objective |
|---|---|
| API availability: valid non-admin requests not returning unexpected 5xx/timeout | 99.9% |
| Durable message acceptance availability | 99.9% |
| Message commit latency, server-side | p95 <= 300 ms during agreed load envelope |
| Online fan-out latency from commit to connected client receipt | p95 <= 1 s |
| Resume correctness | 100% in automated gate: zero accepted-event loss or sequence inversion |
| Attachment authorized upload/download availability | 99.5% |
| Outbox freshness | 99% of committed events published within 5 s; oldest age <60 s |
| Backup recoverability | 100% of scheduled restore drills pass |

Correctness and tenant isolation are invariants, not error-budgeted SLOs: any confirmed cross-tenant access, accepted-message loss, or unrecoverable ordering corruption is severity 1.

At 99.9%, the 28-day availability error budget is about 40 minutes. Freeze non-remediation production changes when 50% of a monthly budget is consumed before the midpoint, or when 100% is consumed. Resume feature releases only after the owner documents recovery actions and the burn rate returns to normal.

### 10.2 Paging policy

Page only on actionable user impact or imminent data loss. Ticket non-urgent trends.

**Immediate page (Sev 1/2):**

- cross-tenant data exposure or suspected credential compromise;
- accepted message loss/corruption or backup/PITR failure with risk to RPO;
- API/message-acceptance multi-window burn: >14.4x budget for 5 minutes and >6x for 30 minutes;
- production unavailable for 5 minutes;
- PostgreSQL storage >90%, unavailable, or connections >90% with failures;
- outbox oldest age >5 minutes and increasing for 10 minutes.

**Urgent ticket/business-hours alert:**

- p95 commit >300 ms for 15 minutes under normal load;
- fan-out p95 >1 second for 15 minutes;
- outbox age >60 seconds for 15 minutes;
- database storage forecast <14 days, connections >70%, or backup age approaching RPO;
- container restart loop, certificate <30 days, log/trace spend or ingestion >80% cap;
- restore drill missed or failed.

Every alert links to a dashboard and runbook, names an owner, includes environment/release, and is tested at least quarterly. Avoid alerting on raw CPU alone unless it predicts user impact.

## 11. Backup and restore

### 11.1 Policy

M1 blocking pilot targets:

- PostgreSQL disaster recovery **RPO <=5 minutes**, **RTO <=60 minutes**.
- Accepted-message RPO is 0 for controlled non-PITR process/restart/failover scenarios.
- Attachment/object recovery must satisfy the release registry's integrity fixture and timed M1 restore; a weaker standalone object target cannot pass `M1-OPS`.
- Audit/configuration needed to interpret restored data follows the PostgreSQL target.

AWS growth retains or improves these targets using RDS PITR/Multi-AZ and versioned S3 policy.

Controls:

- managed automated PostgreSQL backups/PITR with at least 14 days retention for pilot, 35 days when commercially required;
- daily backup-success monitoring independent of the database process;
- encryption in transit and at rest; backup keys/access separate from normal runtime;
- S3 versioning for clean objects, block public access, lifecycle older noncurrent versions, and deny unencrypted writes where supported;
- inventory database references against objects so orphan/missing objects are detectable;
- monthly full restore into a new isolated staging recovery environment; quarterly timed disaster rehearsal;
- record actual recovered timestamp, data checks, smoke-test result, RPO, and RTO. A backup is not considered valid until restored.

### 11.2 Restore rehearsal

Provider-specific restore commands belong in a restricted runbook, but the verification sequence is portable:

```bash
# 1. Restore to a NEW database/endpoint; never overwrite production in place.
# 2. Set recovery environment URLs to the restored database and recovery buckets.
pnpm db:migrate:status -- --environment recovery
pnpm db:integrity:check -- --environment recovery
pnpm test:smoke -- --base-url "$RECOVERY_BASE_URL"
pnpm test:ws-resume -- --base-url "$RECOVERY_BASE_URL"
pnpm test:tenant-isolation:smoke -- --base-url "$RECOVERY_BASE_URL"
pnpm storage:reconcile -- --environment recovery --dry-run
```

Integrity checks include tenant foreign-key boundaries, channel sequence uniqueness/monotonicity, idempotency uniqueness, outbox/message linkage, unread cursor bounds, object reference availability, and audit chronology. Keep recovery isolated from email/push/webhook delivery to prevent side effects.

Restore decision: identify the last known good timestamp, quantify messages/changes after it, obtain incident commander approval, restore to a new target, validate, then switch traffic. Preserve the damaged database read-only for investigation unless legal/security direction says otherwise.

## 12. Incident response and runbooks

Minimum roles: incident commander, operations lead, communications lead, and scribe; one person may cover multiple roles for the pilot. Maintain customer and internal contact routes outside the production application.

Severity:

- **Sev 1:** cross-tenant/security exposure, accepted-message loss/corruption, or complete sustained outage.
- **Sev 2:** major feature unavailable or severe latency with no safe workaround.
- **Sev 3:** degraded feature or limited-scope issue with workaround.

Every runbook starts with: declare incident, assign roles, preserve timestamps/evidence, stop risky changes, identify current/previous image digest and migration, communicate status, mitigate, verify user journey, monitor, close, and schedule a blameless review. Do not improvise destructive SQL.

### 12.1 API unavailable / deploy regression

1. Check external synthetic probe and provider status.
2. Compare release time with error/latency/restart dashboards.
3. Check readiness, memory, connection pool, and PostgreSQL availability.
4. If application-only regression, redeploy the recorded previous digest.
5. If schema-related, do not run down migration; disable the affected path or forward-fix.
6. Verify login, message commit, reconnect/resume, and outbox lag before resolution.

### 12.2 PostgreSQL saturation/unavailable

1. Stop deploys and non-essential backfills/jobs.
2. Check connections, long transactions, lock waits, storage, CPU/IO, and provider events.
3. Reduce worker concurrency or reject non-essential heavy operations; preserve message commits.
4. Terminate a query/session only after identifying owner and blast radius.
5. Escalate to managed provider; fail over only through the documented managed procedure.
6. Verify no accepted-message loss and reconcile outbox after recovery.

Read-only diagnostic examples (run with an audited operator role):

```sql
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
SELECT pid, now() - xact_start AS age, state, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
SELECT * FROM pg_locks WHERE NOT granted;
```

### 12.3 Outbox lag

1. Confirm PostgreSQL health and worker release/restarts.
2. Measure oldest unprocessed row, pending count, attempts, and failing event type.
3. Pause poison event class or dependent side effect; do not delete rows.
4. Scale worker concurrency only within database connection/lock limits.
5. Replay idempotently, verify channel `event_seq` order and duplicate-tolerant consumers.
6. Reconcile committed messages against outbox rows.

### 12.4 Suspected tenant isolation or secret incident

1. Declare Sev 1 and restrict access; do not post sensitive evidence in Chat Core.
2. Preserve audit, access, application, database, and object-store logs.
3. Revoke affected sessions/credentials and block the route/principal/bucket policy.
4. Determine tenants, object keys, queries, and time interval affected.
5. Rotate secrets using the staged dual-key procedure where possible.
6. Follow legal/customer notification policy; verify negative isolation tests before reopening.

### 12.5 Attachment malware or unauthorized access

1. Disable download/presigned URL issuance for affected object(s) or feature.
2. Keep objects quarantined; preserve hashes and scan evidence.
3. Revoke outstanding URLs where the provider permits, otherwise deny via object policy/key move.
4. Audit uploader, downloads, tenant authorization, and scanner state.
5. Fix, rescan, and run authorized-download negative tests before restoration.

### 12.6 Backup restore / regional provider outage

1. Establish last good recovery point and potential data-loss window.
2. Restore to a new isolated target; never overwrite the only copy.
3. Disable outbound notifications and integrations.
4. Run integrity, smoke, resume, tenant isolation, and storage reconciliation gates.
5. Obtain incident commander approval before DNS/traffic switch.
6. Communicate actual RPO/RTO and reconcile any client retries via idempotency keys.

After Sev 1/2, complete a review within five business days: timeline, impact, detection gap, contributing conditions, what worked, actions with owners/dates, and SLO/error-budget effect. Test resulting runbook changes.

## 13. Cost controls

For the pilot:

- set a monthly budget before provisioning and alerts at 50%, 80%, and 100%; route alerts to a named owner and a backup;
- require explicit maximum instance sizes/counts; disable unbounded autoscaling;
- review cost weekly during pilot and monthly after stabilization;
- tag every cloud resource and prohibit untagged production resources through IaC review;
- cap log/trace ingestion and retention; sample successful traces and retain errors;
- set object lifecycle for abandoned multipart uploads, quarantine expiration after policy allows, and old noncurrent versions;
- set ECR/private-registry lifecycle to retain deployed and recent rollback digests while expiring unreferenced builds;
- keep staging scaled to the minimum or suspend stateless services outside test windows if startup behavior remains tested;
- monitor PostgreSQL storage growth, backup storage, object egress, NAT/egress, and observability as separate lines;
- require a cost estimate/diff during infrastructure review and record owner/expiry for temporary resources.

Do not compromise backups, audit retention, tenant isolation, or encryption to save cost. Prefer vertical sizing and query/index work before horizontal complexity. At the AWS transition, compare total cost including NAT, ALB, logs, backup, support, and operator time—not only Fargate CPU/memory.

## 14. Self-hosted portability

A supported self-hosted package is not required for the pilot, but the deployment must remain portable:

| Capability | Portable contract | Pilot implementation | AWS implementation |
|---|---|---|---|
| Compute | OCI image, commands, health endpoints, graceful SIGTERM | managed containers | ECS Fargate |
| Database | supported PostgreSQL major/extensions only | managed PostgreSQL | RDS PostgreSQL |
| Objects | S3 API and presigned URL abstraction | R2 or S3 | S3 |
| Identity | OIDC | managed/customer IdP | customer IdP/Cognito only if selected |
| Telemetry | stdout JSON + OTLP | managed logs/APM | CloudWatch + OTLP |
| TLS/DNS | external reverse proxy, forwarded-header contract | provider TLS | ALB/ACM/Route 53 |
| Configuration | documented environment variables/secret file references | platform secrets | Secrets Manager/task role |

Future self-hosted distribution can consist of versioned Compose manifests for web/API/worker, PostgreSQL, and an S3-compatible endpoint supplied by the customer. It must include a preflight checker, migration job, backup hooks, upgrade compatibility table, and restore test. Do not bundle a fragile production database or claim HA from a single-host Compose installation.

Portability verification before each major release:

```bash
docker compose config --quiet
docker compose up -d --wait
pnpm db:migrate
pnpm test:smoke -- --base-url http://127.0.0.1:3000
pnpm test:ws-resume -- --base-url http://127.0.0.1:3000
docker compose down
```

Application code must not require Render/AWS metadata APIs. Provider adapters live behind configuration/IaC boundaries. Avoid proprietary database extensions unless an ADR documents portability and fallback.

## 15. Readiness checklists

### Pilot launch gate

- [ ] `pnpm ci` passes from a clean trusted-runner checkout.
- [ ] Runtime image digest, SBOM, scan, and provenance evidence retained.
- [ ] Staging and production use isolated PostgreSQL, object buckets, OIDC clients, secrets, and DNS.
- [ ] Staging deploy uses the production candidate digest and all smoke/security/resume gates pass.
- [ ] Correctness gate: 1,000 duplicate retries produce one message; reconnect has no loss/inversion.
- [ ] Reliability gate: 1,000 sockets meet 300 ms commit and 1 s fan-out p95 targets; slow-client test passes.
- [ ] Runtime database role is non-owner/non-DDL; migration role is not available to app containers.
- [ ] Public bucket access is blocked; quarantine/scan/authorized-download negative tests pass.
- [ ] Production backups are enabled; a real isolated restore meets documented RPO/RTO.
- [ ] Dashboards, SLOs, paging, status/customer contact route, and runbooks are live and test-alerts received.
- [ ] Budget, caps, retention, lifecycle, and cost ownership are configured.
- [ ] Rolling/restart rehearsal proves clients resume from durable cursors.
- [ ] Operators can identify and redeploy the previous image digest.

### AWS growth gate

- [ ] A measured trigger, capacity model, and full cost comparison justify migration.
- [ ] IaC creates isolated non-production first; plan is reviewed and drift checked.
- [ ] RDS PITR/Multi-AZ and S3 recovery are restored and timed.
- [ ] ECS graceful shutdown/deregistration and WebSocket resume pass during rolling deploy.
- [ ] Two-gateway fan-out solution is selected from load evidence and remains duplicate tolerant.
- [ ] No Kubernetes, Kafka, or OpenSearch is added without a separate ADR and measured need.

## 16. Ownership and first implementation tasks

AW-007/AW-008 should treat these as executable platform contracts:

1. Add the pinned multi-stage Dockerfile, `.dockerignore`, Compose stack, health checks, and non-root runtime.
2. Add `pnpm ci`, smoke, correctness, tenant-isolation, WebSocket-resume, load, migration, integrity, and storage-reconcile script entry points as their corresponding product capabilities land.
3. Add startup environment validation and separate runtime/migrator database roles.
4. Instrument JSON logs and OpenTelemetry before staging; include release digest and request/command correlation.
5. Create provider IaC/config only after the application contract runs locally and CI gates pass.
6. Run and retain the first staging deploy, rolling restart, backup restore, and incident tabletop evidence before pilot launch.

This sequence keeps early operations small while preserving the correctness, recovery, and portability guarantees that a commercial Chat Core needs.
