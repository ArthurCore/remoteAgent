# AW-006E — Authoritative Source and Provenance Policy

- **Status:** Accepted foundation policy
- **Date:** 2026-08-24
- **Policy owner:** Security owner
- **Implementation owners:** Platform owner for product Git/CI; Connector owner for customer-repository controls; OSS compliance owner for dependency and source-intake gates
- **Required approvers for material change:** Security owner and Engineering owner; Privacy/Legal or OSS counsel when the change affects customer-source egress, contractual terms, restricted source, or distribution obligations

## 1. Authority, scope, and terms

This is the normative policy for:

- where Agent Workspace product source may be stored and built;
- how a future Local Agent Connector handles a customer's repository, paths, and vendor credentials;
- how ordinary dependencies differ from copied or adapted upstream material;
- restricted-source clean-room work;
- source-related secrets, CI artifacts, ownership, and review gates.

When another foundation document conflicts on one of those subjects, this policy controls. In particular:

1. The statement in `docs/operations/platform-plan.md` that product source must remain local, and the hosted-CI prohibition derived from it, are superseded. **Agent Workspace product source may use approved private hosted Git and CI.**
2. A dedicated source-local product runner is an **optional security/deployment profile**, not the default, not an AW-007 architecture requirement, and not a condition for using the provider-neutral `pnpm ci` contract.
3. The `docs/research/source-adoption-matrix.md` intake rules still control source-specific licensing posture. Its provenance gate is interpreted as the two separate lanes in §5 below; an ordinary transitive dependency does not require a manual upstream-file-to-local-file copy ledger.

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative.

### 1.1 Source classes and trust boundaries

| Class | Includes | Default boundary |
|---|---|---|
| **Product source** | First-party Agent Workspace code, tests, schemas, documentation, assets, IaC, and build definitions maintained as the product | MAY be stored in an approved private hosted Git service and processed by approved private hosted CI |
| **Customer repository material** | Customer code, tests, assets, prompts, documentation, generated files, diffs, patches, commit history, untracked files, repository indexes/embeddings, and build/test output that reproduces them | Remains on the customer's machine by default; not copied to Agent Workspace services or product CI |
| **Customer repository location metadata** | Absolute/relative filesystem paths, repository basename derived from a path, remote URLs, branch names, workspace layout, file names, and path-bearing diagnostics | Remains local by default; only the narrowly allowed connector modes in §4 may disclose selected logical metadata |
| **Vendor credentials** | Model/provider login state, API keys, refresh/access tokens, CLI credentials, cookies, SSH keys, and credential-store entries used by a customer's local Agent tool | Remains in the customer's OS credential boundary; never uploaded to Agent Workspace services in any connector mode |
| **Ordinary third-party dependencies** | Package-manager dependencies, base images, container layers, build tools, CI actions, SDK packages, and their transitives | Dependency/SBOM/license lane in §5.1 |
| **Copied/adapted upstream material** | Any upstream code, test, schema, fixture, asset, documentation, prompt, snippet, generated output, or substantial structure copied or translated into a product-owned path | Exact source-to-local provenance lane in §5.2 |
| **Restricted or unclear source** | Copyleft/commercial/mixed-license material not approved for direct intake, private third-party source, and material of uncertain rights or origin | No direct intake; clean-room/counsel gate in §6 |

“Local” for customer repository material means within the customer's controlled machine or an explicitly customer-approved local network/storage boundary. It does not mean that Agent Workspace product source must be local.

## 2. Core decisions

1. **Do not conflate product source with customer source.** Product engineering may use approved private hosted Git and CI. Attaching a personal Agent does not grant the product, its CI, analytics, support tooling, or operators access to the customer's repository.
2. **Customer-source egress is opt-in and bounded.** The future Connector starts in `metadata-only` mode. It cannot silently escalate to sending snippets or artifacts because a server, Agent, prompt, or vendor asks it to.
3. **Vendor credentials are local-only.** The Connector may invoke a customer-selected local vendor client, but it MUST NOT proxy, synchronize, log, back up, or expose that client's credentials to Chat Core.
4. **Provenance has two auditable lanes.** Package/container dependencies use automated inventory and policy scanning. Directly copied/adapted code, assets, and tests require exact upstream-to-local mapping. A component may be in both lanes.
5. **Restricted-source work is behavior-only by default.** Clean-room evidence and counsel approval are separate from permissive source intake and from ordinary dependency scanning.
6. **Provider-neutral builds remain mandatory.** Hosted CI is permitted, but the authoritative commands and acceptance semantics live in the repository and must also be runnable in a clean checkout outside a provider-specific runner.

## 3. Product source: private hosted Git and CI

### 3.1 Approved hosted source

Product source MAY be placed in a private hosted Git organization after the `HOST-1` gate in §9. The approved configuration MUST provide:

- organization-owned private repositories; public mirrors and personal-account forks are disabled unless separately approved;
- named accounts, SSO where available, phishing-resistant MFA for administrators, least-privilege teams, and prompt access removal on role change;
- protected default/release branches, required review and status checks, and controlled force-push/deletion;
- auditable repository, administrator, secret, and CI configuration changes;
- encryption in transit and at rest, documented provider retention/deletion behavior, and an export/recovery procedure tested at least annually;
- quarterly access review and review of installed applications, deploy keys, webhooks, OAuth grants, and machine users;
- a documented provider owner and incident contact.

A hosted copy is an approved product-source backup/recovery input only if export and restore have actually been tested. Provider availability is not a substitute for a recovery procedure.

### 3.2 Approved hosted CI

Private hosted CI MAY build and test product source after `HOST-1`. Its workflow MUST:

- start from the reviewed commit in a clean checkout and record the commit SHA and dirty-tree assertion where applicable;
- invoke repository-owned commands such as `pnpm ci`; no required quality gate may exist only as opaque provider configuration;
- use read-only repository permissions by default and grant write, package-push, attestation, or deployment permissions per job;
- use short-lived workload identity/OIDC for registries and cloud roles where supported; long-lived cloud keys are prohibited unless a time-bounded exception is approved;
- withhold secrets from forked/untrusted pull requests and prevent unreviewed pull-request code from entering a secret-bearing or deployment job;
- pin or otherwise integrity-lock third-party CI actions, images, and tools under the dependency lane;
- isolate jobs, prevent cache/artifact poisoning across trust levels, and keep production deploy approval separate from source-build success;
- run secret scanning and redact logs before artifact publication;
- retain the release evidence required by §7 without retaining prohibited content.

Hosted CI MUST NOT receive customer repository material, customer data, customer vendor credentials, production database copies, or a developer's personal credential store. A product workflow that tests the Connector uses synthetic repositories and synthetic credentials only.

### 3.3 Optional source-local product CI profile

A dedicated local product-source runner MAY be selected for an offline, regulated, contractual, or higher-assurance deployment after a recorded threat-model decision. This profile:

- runs the same repository-owned commands and produces the same required evidence as hosted CI;
- uses a clean checkout and isolated credentials, not a developer's working tree;
- may publish approved runtime/release artifacts to private remote services;
- MUST meet the same branch, review, dependency, provenance, secret, and release gates;
- MUST NOT be described as inherently safer without documenting its patching, physical access, backup, key custody, and operator risks.

The profile is optional. AW-007 MUST NOT assume a local bare remote, a dedicated on-premises runner, or a ban on private hosted source/CI.

## 4. Customer repository and future Connector policy

### 4.1 Local-by-default invariant

Before the Connector may attach a repository, its product acceptance gate MUST prove that, by default:

- repository bytes, commit history, diffs, indexes/embeddings, file names, and raw filesystem paths are processed locally and are not synchronized to Chat Core;
- repository content is not included in telemetry, analytics, crash reports, support bundles, traces, or product CI;
- cloud state uses an opaque repository-binding ID and an optional user-entered display label, never an identifier silently derived from a local path or remote URL;
- local indexes, task scratch space, and cached snippets are scoped to the binding, protected using OS access controls, excluded from product telemetry/backups, and purged on revoke/uninstall according to the displayed local-retention policy;
- symlinks, nested repositories, ignored/untracked files, archives, and files outside the selected root are denied unless a later explicit-artifact selection separately authorizes the exact item;
- the server can request additional context but only the local Connector can authorize a mode transition or assemble an outbound payload;
- failure to classify, scan, or obtain required consent fails closed.

Direct text that a user deliberately pastes into Chat Core is customer chat content, not automatic Connector egress. The client SHOULD still warn and scan for likely secrets, and normal chat retention/access rules apply.

### 4.2 Connector egress modes

These modes govern repository-derived material sent by the Connector to Chat Core, another participant, support tooling, or any vendor endpoint for which the Connector constructs or forwards the payload. They must be implemented as enforceable data-flow controls, not prompt instructions.

| Mode | Allowed outbound data | Prohibited data | Activation, record, and retention |
|---|---|---|---|
| **`metadata-only`** — default | Opaque binding ID; user-entered display label; Connector/version/capability status; Agent online/busy state; task status and natural-language results that do not reproduce source, file names, paths, diffs, or distinctive source strings | Repository bytes/snippets; derived file lists; branch/remote/commit data unless separately user-entered for the task; indexes/embeddings; path-bearing diagnostics; automatic attachments | Active on every new binding and after policy reset. No source-egress consent is inferred from pairing or mentioning an Agent. Source-like output is blocked or held for user review rather than silently sent. |
| **`redacted-snippet`** — bounded disclosure | A user-selected or locally previewed minimal excerpt needed for one task, plus a user-supplied logical label; locally generated diagnostic context only after minimization and redaction | Whole files; directory listings; archives; hidden/credential files; raw absolute paths; unrelated surrounding context; binary assets; snippets whose license or secret status cannot be determined | Requires an affirmative per-task action or a narrowly scoped customer-admin rule that the UI shows at the point of use. The local preview shows exact outbound text and destinations. Apply secret detection, path stripping, size/line limits, and content-type rules. Record mode, task, destination, byte count, policy decision, and timestamp—not the snippet itself—in the local audit record. Remote retention follows chat retention and must be shown before send. |
| **`explicit-artifact`** — selected transfer | An exact file, patch, diff, test report, log, or other artifact the user selects and previews; a repository-relative logical path only if the user explicitly includes it | Ambient repository access; folder/repository upload; home/absolute path; keychains, `.env*`, credentials, tokens, SSH material, browser/vendor profiles, unrelated files, or an artifact that fails scanning | Requires affirmative confirmation for each artifact and destination. Before upload show name/logical path, type, size, hash, detected secret/license warnings, recipients, purpose, and remote retention/deletion behavior. Record consent and the artifact hash. Directory/archive or bulk-source transfer requires a separate Security/Privacy-approved enterprise policy and is not a normal mode. |

Additional invariants:

- Vendor credentials are prohibited in all three modes and cannot be waived through ordinary artifact confirmation.
- An absolute path MUST be removed before egress. A repository-relative logical path is content metadata and is allowed only under the table above.
- Redaction lowers accidental disclosure risk; it is not proof that a snippet is anonymous, non-confidential, or legally reusable.
- A mode grant is scoped to a repository binding, principal, destination, purpose, and time window. It does not carry across repositories, Agents, channels, vendors, or reinstalls.
- Revoke immediately stops new egress, invalidates Connector credentials, and triggers the documented local cache purge. It cannot retroactively remove chat content or artifacts; the UI must state this before disclosure.
- Cloud policy may narrow a local mode but cannot broaden it. Unknown/mismatched policy versions fail to `metadata-only`.

### 4.3 Customer-selected Agent vendors

A locally invoked Agent CLI may itself communicate with a model/vendor. That vendor is a separate data destination governed by the customer's direct account, configuration, and contract. The Connector MUST:

- keep the vendor credential in the customer's OS keychain/secure store or vendor-owned local client;
- never send the credential to Chat Core or make it a Chat Core environment variable;
- identify the vendor destination and whether processing is remote before the first repository-reading task;
- apply the mode controls above to payloads it constructs or forwards;
- not label a session “local-only” if an independently operating vendor client may transmit repository context under its own rules;
- offer a fail-closed way for customer policy to prohibit remote-vendor repository processing.

Consent to pair a Connector is not consent to disclose source to a vendor, and consent to a vendor is not consent to store source in Chat Core.

## 5. Two separate provenance lanes

### 5.1 Lane A — ordinary dependency, SBOM, vulnerability, and license compliance

This lane applies to package-manager dependencies, base images/container layers, CI actions, compilers/build tools, SDK packages, fonts/assets consumed as packages, and direct/transitive runtime or build dependencies.

Required evidence:

- a frozen lockfile or immutable image/action digest;
- a machine-generated SBOM for each shipped image/application/artifact, including transitives where the ecosystem supports it;
- vulnerability and malware scanning under the release policy;
- automated license identification plus a reviewed allow/deny/exception policy;
- applicable license text, attribution, source-offer, and `NOTICE` material in the distribution-specific notice bundle;
- an owner and expiry/remediation decision for every accepted policy exception;
- retention of scanner/tool version, inputs, release commit, output, and review decision.

Gate semantics:

- every shipped package/layer must be represented in the relevant inventory; unexplained SBOM components are blocked;
- forbidden licenses and unapproved fixable critical vulnerabilities are blocked;
- scan uncertainty is reviewed; “unknown” is not silently treated as permissive;
- a manual upstream path/line-to-local path entry is **not** required merely because a package is transitive;
- if a dependency is patched, vendored, copied, generated into a product-owned path, or mined for a test/asset/snippet, the affected material also enters Lane B.

### 5.2 Lane B — exact source-to-local provenance for copied or adapted material

This lane applies when product-owned code, assets, tests, schemas, fixtures, documentation, prompts, UI text, generated files, or substantial structure is copied, translated, ported, or adapted from an upstream source. File type and small size do not exempt a snippet.

Before merge, the source-intake ledger and PR MUST record:

- canonical upstream repository/URL, full commit SHA or immutable version, tag/release, source path, and exact line range; for a whole-file asset, its upstream hash;
- destination product path and, when practical, local line/range or symbol;
- original copyright and file/root/subdirectory license evidence, including relevant history when a mixed repository or license move is possible;
- whether the material is generated, vendored, bundled, or carries separate asset/data/model terms;
- a summary and date of local modifications and whether the implementation is copied, translated, or structurally adapted;
- deployment forms affected: source, browser/mobile bundle, downloadable Connector/CLI, OCI/on-premises image, and/or SaaS;
- dependencies introduced and the corresponding Lane-A evidence;
- exact license/NOTICE/modified-file/source-offer obligations and where each is delivered;
- implementing engineer, designated OSS reviewer, approval ID, and counsel ID when required;
- first-party security, tenant-isolation, correctness, and fit tests for the adopted material.

Recommended PR trailers remain:

```text
Upstream-Source: https://example.invalid/<owner>/<repo>
Upstream-Commit: <full immutable commit>
Upstream-Path: <path>:<lines>
Upstream-License: <SPDX identifier or reviewed terms>
Local-Modifications: <summary and date>
OSS-Review: <ticket/approval>
```

Lane-B gate semantics:

- copied/adapted local artifacts without an approved source-to-local record are blocked;
- provenance follows moved/renamed local files and is updated when the upstream basis changes;
- copied tests, snapshots, sample data, icons, fonts, images, prompts, and documentation are reviewed like code, not assumed free because they are non-runtime material;
- NOTICE and attribution are checked per delivered artifact (web, mobile, Connector/CLI, server/on-premises image), not only in one server document;
- unclear origin is quarantined and classified as restricted/unclear source under §6.

The two lane invariants are therefore: **no untracked shipped dependencies in Lane A; no untracked copied/adapted artifacts in Lane B.** There is no requirement to manufacture an exact file/line copy mapping for every ordinary transitive dependency.

## 6. Restricted-source clean-room and counsel gate

Restricted or unclear source includes the sources classified `C` or `X` in the source-adoption matrix unless a recorded commercial/license decision allows a narrower use. It also includes private third-party source, leaked source, copied material with unknown provenance, mixed permissive/proprietary trees whose boundary is unresolved, and source whose terms prohibit the proposed closed-product use.

### 6.1 Default posture

- Direct copying, adaptation, translation, linking, vendoring, generated-schema intake, test/fixture reuse, and asset reuse are prohibited.
- The allowed baseline is public-document/API/spec review and black-box behavior benchmarking.
- A source observer writes a product-language behavior card; an implementer creates independent design and first-party failing tests without receiving restricted implementation material.
- If one person has already viewed the restricted source, that fact is recorded and an independent reviewer assesses the output and evidence. Role separation is a control, not a claim that knowledge can be erased.

### 6.2 Isolation and evidence

Restricted source MUST NOT enter:

- the product repository, pull requests, issues, ordinary chat, support tickets, or CI inputs;
- coding-Agent prompts/context, shared clipboard history, vector indexes, embeddings, or code-search corpora used by implementers;
- customer-repository examples, test fixtures, screenshots, source maps, or release artifacts.

Allowed implementation inputs are public user documentation, public standards/API specifications, black-box request/response traces that contain no restricted implementation material, and independently written behavior cards. Preserve dated behavior cards, observer/implementer assignments, design notes, first-party failing tests, commit history, and reviewer attestations.

Before release, scan for prohibited path/source fingerprints, long matching token sequences, distinctive private identifiers, error strings, fixture values, and source-specific internal names. Every match is investigated; the scan is evidence, not a safe-harbor test.

If a restricted snippet is pasted into a ticket/chat/prompt or found in a branch:

1. stop use and sharing;
2. restrict/quarantine the record without copying it into a remediation ticket;
3. notify Security and OSS compliance owners;
4. preserve only the access/audit facts needed for investigation;
5. remove it through the relevant history/artifact purge procedure and rotate any exposed secret;
6. reassess affected implementation with OSS counsel before merge/release.

### 6.3 Counsel-required decisions

Written OSS/legal approval is required before any proposed use involving copyleft/commercial source in a closed product, mixed CE/EE history, unclear generated/bundled provenance, patent/NOTICE/source-offer ambiguity, proprietary assets/trademarks, customer on-premises/source distribution, downloadable/mobile obligations, or vendor terms separate from an OSS license.

A clean room improves independent-development evidence; it does not itself establish non-infringement, license compliance, or permission to ship.

## 7. Secrets and CI/release artifacts

### 7.1 Secret rules

Secrets MUST NOT be placed in Git, pull-request text, issue/chat content, Docker build arguments, image layers, SBOMs, provenance attestations, caches, test snapshots, logs, traces, crash dumps, source maps, or support bundles.

- Product CI uses short-lived, job-scoped identity. Build/test jobs have no production application secrets. Release and deployment identities are separate and least-privileged.
- Customer vendor credentials remain in the local OS/vendor credential store and are neither backed up by Agent Workspace nor included in Connector diagnostics.
- Product and Connector repositories use pre-commit/CI secret scanning with redacted output. Secret-like findings are investigated without reposting the value.
- On suspected exposure, stop publication, restrict affected artifacts/logs, revoke and rotate the credential, purge reachable copies under provider retention capabilities, and record the residual retention risk.
- Logs may contain a secret name or stable non-reversible reference when necessary, never the value or a reusable/hash-equivalent representation.

### 7.2 Artifact policy

| Artifact | Policy |
|---|---|
| OCI image, migration artifact, SBOM, vulnerability/license report, provenance attestation, signature, sanitized test result | Allowed in approved private stores with integrity, access, retention, and release-digest binding |
| CI logs, test reports, coverage, traces, crash reports | Conditional. Minimize and redact; use synthetic data; remove absolute/home paths. Treat coverage/source excerpts and crash memory as source-sensitive and restrict access/retention accordingly |
| Source maps and debug symbols | Conditional. They may contain or reconstruct product source. Store only in an approved private symbol service, separate from public assets, with least privilege and explicit retention |
| Build cache | Conditional. Scope by repository/trust level, integrity-key it, prevent untrusted-to-trusted cache writes, and set retention. A provider cache is a hosted source-derived copy |
| Product source archive | Only for an approved backup/export or intentional source distribution with access and license review; not an incidental CI artifact |
| Customer repository content/path/index, customer data, vendor credentials, `.env*`, keychains, browser/vendor profiles, production dump | Prohibited in product CI artifacts and support bundles |

Every release-candidate evidence set MUST identify the producing commit/workflow, tool versions, artifact digests, access class, retention destination, and owner. Publication checks MUST inspect image layers and artifact contents, not merely filenames. Runtime images exclude `.git`, credentials, caches, unrelated tests/fixtures, and source not required at runtime.

Artifact retention is explicit rather than provider-default. Expiry must preserve the evidence period required for release/audit while minimizing source-bearing diagnostics. Legal hold overrides deletion only through a documented owner decision.

## 8. Threat model and required controls

| Threat | Example consequence | Required controls |
|---|---|---|
| Scope confusion between product and customer source | A hosted product CI job receives a customer's private repository | Separate classifications and credentials; synthetic Connector fixtures; deny customer bindings in product CI; audit egress |
| Accidental Connector exfiltration | Paths, diffs, ignored files, or source enter chat/telemetry | `metadata-only` default; local allowlist assembly; preview/consent; path stripping; secret scan; fail closed; revoke/purge |
| Malicious prompt/server/vendor request | An Agent is told to upload a repository or credential | Mode enforcement outside the model; server cannot escalate; credential types hard-denied; bounded destinations and grants |
| Hosted Git/CI account compromise | Product source theft or malicious release | Private organization, SSO/MFA, least privilege, access review, audit, protected branches, isolated signing/deploy identity, reproducible evidence |
| Untrusted PR or supply-chain job | CI code steals tokens or poisons cache/artifacts | No secrets for untrusted code; pinned actions/images; job permissions; trust-separated caches; reviewed workflow changes; attest/sign by digest |
| Secret leakage through derived output | Token appears in logs, source maps, test snapshots, SBOM, or artifact | Preventive scanning/redaction, synthetic data, artifact inspection, private restricted stores, rotation and purge playbook |
| Dependency/license drift | Forbidden license or vulnerable transitive component ships | Locked inputs, Lane-A SBOM/license/vulnerability policy, release-specific notices, reviewed exceptions with expiry |
| Copied-source provenance loss | Copied test/asset is mistaken for first-party work | Lane-B exact mapping, PR trailers/ledger, rename tracking, OSS review, artifact-specific notices |
| Restricted-source contamination | Proprietary/AGPL implementation enters closed core or Agent context | Source isolation, observer/implementer separation, behavior cards, similarity scan, quarantine, counsel gate |
| Artifact over-retention | Source-bearing cache/log/map survives beyond need or broad access | Explicit classification, private storage, least privilege, retention/expiry, audited deletion/export |
| Local-machine compromise | Customer source, local index, or vendor session is stolen | OS permissions/keychain, least-privilege Connector, local cache scope/purge, no claim that “local” eliminates endpoint risk |

Out of scope for this policy are the detailed controls of an already-compromised customer OS and the confidentiality promises of a customer-selected model vendor. The Connector must expose those boundaries honestly rather than implying that local orchestration makes third-party processing local.

## 9. Owners and review gates

A named person or on-call group must fill each owner role before the related capability is enabled. Role names in this policy are not permission for an unowned launch.

| Gate | When it blocks | Required evidence | Required approval |
|---|---|---|---|
| **`HOST-1` — hosted source/CI approval** | Before product source or builds use a new hosted provider, organization, app, runner class, region, or material retention model | Provider threat model; private-org/access configuration; SSO/MFA; audit/retention/export; runner permissions; secret and artifact design; recovery test plan | Security owner + Platform owner |
| **`PR-1` — product change gate** | Before merge to a protected product branch | Required reviewers/checks; clean dependency and secret results; provenance classification (`independent`, Lane A, Lane B, or clean-room); no untrusted secret-bearing job | Engineering owner/delegate; Security/OSS owners when their lane triggers |
| **`DEP-1` — dependency gate** | Before merge and release of a new/changed package, base image, CI action, or bundled dependency | Lock/digest, SBOM delta, vulnerability/license result, notice delta, exception owner/expiry | Owning engineer + OSS compliance owner for exceptions/unknowns |
| **`SRC-1` — copied/adapted source gate** | Before copied/adapted code, asset, test, schema, prompt, docs, fixture, or generated material enters the product branch | Complete Lane-B record, rights/history review, PR trailers, notices, first-party tests, distribution analysis | Owning engineer + designated OSS reviewer; counsel if §6.3 triggers |
| **`CR-1` — restricted-source clean-room gate** | Before implementation informed by restricted source is merged or released | Source classification; role/access record; behavior card; independent tests/design; similarity findings; reviewer attestation; counsel decision when required | Security owner + OSS compliance owner + Engineering owner; counsel where triggered |
| **`CONN-1` — Connector source-egress gate** | Before any customer-repository attachment ships, and again before `redacted-snippet` or `explicit-artifact` is enabled | Data-flow/threat model; mode state machine; local enforcement tests; telemetry/support exclusion tests; consent/preview UX; secret/path/symlink/archive negative tests; revoke/purge test; vendor-boundary disclosure; retention behavior | Security owner + Connector owner + Product owner; Privacy/Legal review for customer-content egress/retention |
| **`REL-1` — release evidence gate** | Before promoting a product release | Commit/workflow identity; tests; image/artifact digests; Lane-A SBOM/scan/notices; Lane-B ledger completeness for copied/adapted artifacts; restricted-source findings; secret scan; artifact manifest/retention; signatures/attestations required by release profile | Release owner; Security/OSS sign-off on open exceptions |
| **`EXC-1` — exception gate** | Before deviating from any MUST/MUST NOT | Scope, data/source class, destination, threat analysis, compensating controls, owner, start/expiry, detection and rollback/purge plan | Policy owner plus affected implementation owner; Privacy/Legal/OSS counsel when their subject is affected |

Exceptions are narrow, time-bounded, and non-precedential. An expired exception fails closed. Vendor convenience, schedule pressure, or the fact that data was already disclosed is not approval.

The Security owner reviews this policy at least annually, after a source/credential incident, before Milestone-2 Connector launch, and whenever the Git/CI provider, Connector egress model, customer deployment form, or source-license posture materially changes.

## 10. Release assertions

A release may claim compliance with this policy only when all applicable assertions are backed by retained evidence:

- product source/CI ran under an approved hosted or optional source-local profile;
- no customer repository material or vendor credential entered product Git, CI, artifacts, telemetry, or support tooling;
- ordinary shipped dependencies are inventory-complete and passed Lane A;
- every copied/adapted local artifact has an approved Lane-B source-to-local record;
- restricted-source work passed its clean-room/counsel gate and all similarity findings were resolved;
- CI/release artifacts were content-inspected, classified, access-controlled, and assigned explicit retention;
- open exceptions are approved, unexpired, and listed with owners;
- for a Connector release, the default is `metadata-only`, mode transitions and previews are local and explicit, and credential/path/secret negative tests pass.

This policy deliberately permits modern private hosted product development while preserving the stricter boundary that matters to attached personal Agents: **customer repository source, repository paths, and vendor credentials remain local by default and leave that boundary only through the narrowly defined, user-visible controls above; credentials never leave through those controls.**
