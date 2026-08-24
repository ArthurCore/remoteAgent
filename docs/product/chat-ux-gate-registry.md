# Chat UX Milestone 1 Gate Registry (AW-006F)

## 1. Authority and denominator

This file is the countable Milestone 1 gate registry for the criterion IDs in
[`chat-ux-acceptance.md`](./chat-ux-acceptance.md). It resolves I-01 in
[`foundation-review-xhigh.md`](../reviews/foundation-review-xhigh.md).

The denominator is mechanical: a criterion is a source line matching
`^- **<ID>:**`. Unnumbered principles, release outcomes, journey steps,
journey-acceptance prose, section-level state-contract prose, and §23 roll-up
statements explain or exercise the identified criteria; they do **not** add
unnumbered gate rows. A new obligation enters this registry only after the
acceptance specification gives it an ID and this table is updated in the same
change.

The current source contains **179 occurrences and 179 unique IDs**, not 153.
The review's 153 is exactly the count of the simple three-letter families. It
omitted the 12 `A11Y-*` IDs and the 14 `STA-*` IDs: `153 + 12 + 14 = 179`.
Explicitly deferred boundary IDs (`NTF-09`, `ADM-10`, and `RWD-09`) remain in
the denominator and are tiered as tracked polish; they do not promote the
deferred capabilities into M1.

| Source family | Unique IDs |
|---|---:|
| ONB | 10 |
| NAV | 12 |
| TIM | 12 |
| CMP | 12 |
| THR | 9 |
| RCT | 6 |
| EDT | 9 |
| URD | 10 |
| FIL | 11 |
| SRC | 9 |
| NTF | 9 |
| PRS | 7 |
| ADM | 10 |
| STA-E | 3 |
| STA-L | 4 |
| STA-R | 4 |
| STA-P | 3 |
| NET | 11 |
| A11Y | 12 |
| RWD | 9 |
| POL | 7 |
| **Total** | **179** |

## 2. Tier and evidence policy

A criterion is atomic for gate purposes. If one ID combines several clauses,
the most protective applicable tier governs the whole ID; clauses are not
silently split into a lower tier.

| Tier | M1 decision rule |
|---|---|
| `NON_WAIVABLE` | Required evidence must pass. No product, schedule, or first-release exception is allowed. This is the floor for privacy/authorization, durable send truth, reconnect convergence, and the core keyboard/screen-reader journeys. |
| `RELEASE_BLOCKING` | Required evidence must pass unless the release authority approves a written exception containing owner, rationale, user impact, mitigation/rollback, tracking issue, and an expiry of at most 14 days/one release. The exception expires automatically. |
| `TRACKED_POLISH` | A gap does not fail M1, but the release manifest must link a tracking issue with owner, user impact, and target release. It is not evidence that the criterion passed. |

Conditional language in the source remains conditional. For example, an
optional browser-notification implementation may be absent, but if it is
shipped its permission/privacy clauses retain the row's tier. Missing evidence
for an applicable `NON_WAIVABLE` or unexcepted `RELEASE_BLOCKING` row is a
failure. Passing no-op, skipped, empty, or placeholder tests are missing
evidence, not a pass.

Evidence modes are exact:

- `AUTOMATED`: automated artifact required; manual artifact not required.
- `MANUAL`: signed manual artifact required; automated artifact not required.
- `HYBRID`: both artifacts required and both must pass.

`CODE::ID` in a row means the artifact must contain a case/checklist entry
whose stable key is that exact criterion ID. One report may cover many IDs,
but prose saying a suite “generally covers” a family is not traceability.
Every artifact records release ID, Git SHA, immutable image digest where
applicable, environment, timestamp, and pass/fail result.

### 2.1 Artifact catalog

| Code | Command / required artifact |
|---|---|
| `AUTO-E2E` | `pnpm test:e2e`; `artifacts/chat-ux/<release-id>/auto-e2e/results.json` plus Playwright traces for failures. |
| `AUTO-ISO` | `pnpm test:isolation`; `artifacts/chat-ux/<release-id>/auto-isolation/results.json` covering HTTP, realtime, search, file, invite, and admin denial paths. |
| `AUTO-MODEL` | `pnpm test:unit` and/or `pnpm test:integration`; JUnit plus seeded model/counterexample data under `artifacts/chat-ux/<release-id>/auto-model/`. |
| `AUTO-REL` | `pnpm test:reliability`; `artifacts/chat-ux/<release-id>/auto-reliability/results.json` plus fault timeline and cursor reconciliation. |
| `AUTO-A11Y` | `pnpm test:a11y`; axe JSON plus keyboard assertion results under `artifacts/chat-ux/<release-id>/auto-a11y/`. |
| `MAN-UX` | Signed exploratory/usability checklist entry in `artifacts/chat-ux/<release-id>/manual/ux.md`, with browser/viewport and linked capture or notes. |
| `MAN-SEC` | Signed privacy/authorization review entry in `artifacts/chat-ux/<release-id>/manual/security.md`, including positive and negative principal/channel cases. |
| `MAN-A11Y-KB` | Signed keyboard-only journey entry in `artifacts/chat-ux/<release-id>/manual/a11y-keyboard.md`. |
| `MAN-A11Y-SR` | Signed screen-reader journey entry in `artifacts/chat-ux/<release-id>/manual/a11y-screen-reader.md`, including pairing/version. |
| `MAN-RWD` | Signed 320 px/tablet/wide/touch review entry in `artifacts/chat-ux/<release-id>/manual/responsive.md`. |

The script names above are evidence contracts for the owning capability when it
lands; they do not authorize AW-007 to add green placeholders.

### 2.2 Owner-card interpretation

The owner card is the single card accountable for closing and linking the row's
evidence; implementation can span that card's dependencies. An ownership
transfer requires changing the registry row in the same reviewed change—`TBD`
or multiple owners are not valid.

| Owner card | Evidence accountability in this registry |
|---|---|
| `AW-009` | Onboarding, workspace/channel/DM, membership, administration, and their authorization-facing UX. |
| `AW-010` | Durable timeline/composer and message-adjacent features/projections: thread, reaction, edit/delete, unread, file, search, and notification. |
| `AW-011` | Presence/realtime delivery, reconnect, resume, and convergence. |
| `AW-012` | Cross-surface states, accessibility, responsive behavior, commercial-polish review, and final evidence-manifest reconciliation. |

## 3. Exact tier counts

| Tier | Count |
|---|---:|
| `NON_WAIVABLE` | **91** |
| `RELEASE_BLOCKING` | **54** |
| `TRACKED_POLISH` | **34** |
| **Total** | **179** |

## 4. Criterion registry

| ID | Tier | Evidence mode | Owner card | Automated artifact | Manual artifact |
|---|---|---|---|---|---|
| ONB-01 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::ONB-01 |
| ONB-02 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::ONB-02 | MAN-UX::ONB-02 |
| ONB-03 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::ONB-03 |
| ONB-04 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::ONB-04 | MAN-UX::ONB-04 |
| ONB-05 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ONB-05 + AUTO-ISO::ONB-05 | MAN-SEC::ONB-05 |
| ONB-06 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ONB-06 + AUTO-ISO::ONB-06 | MAN-SEC::ONB-06 |
| ONB-07 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ONB-07 | MAN-UX::ONB-07 |
| ONB-08 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ONB-08 + AUTO-ISO::ONB-08 | MAN-SEC::ONB-08 |
| ONB-09 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ONB-09 | MAN-A11Y-KB::ONB-09 + MAN-A11Y-SR::ONB-09 |
| ONB-10 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::ONB-10 | MAN-UX::ONB-10 |
| NAV-01 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::NAV-01 | MAN-UX::NAV-01 |
| NAV-02 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::NAV-02 + AUTO-ISO::NAV-02 | MAN-SEC::NAV-02 |
| NAV-03 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::NAV-03 + AUTO-ISO::NAV-03 | MAN-SEC::NAV-03 |
| NAV-04 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::NAV-04 | MAN-UX::NAV-04 |
| NAV-05 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::NAV-05 + AUTO-ISO::NAV-05 | MAN-SEC::NAV-05 |
| NAV-06 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::NAV-06 |
| NAV-07 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::NAV-07 + AUTO-ISO::NAV-07 | MAN-SEC::NAV-07 |
| NAV-08 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::NAV-08 | MAN-UX::NAV-08 |
| NAV-09 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::NAV-09 |
| NAV-10 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::NAV-10 |
| NAV-11 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::NAV-11 + AUTO-ISO::NAV-11 | MAN-SEC::NAV-11 |
| NAV-12 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::NAV-12 + AUTO-ISO::NAV-12 | MAN-SEC::NAV-12 |
| TIM-01 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::TIM-01 + AUTO-MODEL::TIM-01 | — |
| TIM-02 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::TIM-02 |
| TIM-03 | RELEASE_BLOCKING | AUTOMATED | AW-010 | AUTO-E2E::TIM-03 | — |
| TIM-04 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::TIM-04 | MAN-UX::TIM-04 |
| TIM-05 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::TIM-05 | MAN-UX::TIM-05 |
| TIM-06 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::TIM-06 | MAN-UX::TIM-06 |
| TIM-07 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::TIM-07 | MAN-A11Y-KB::TIM-07 + MAN-A11Y-SR::TIM-07 |
| TIM-08 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::TIM-08 + AUTO-ISO::TIM-08 | MAN-SEC::TIM-08 |
| TIM-09 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::TIM-09 |
| TIM-10 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::TIM-10 + AUTO-ISO::TIM-10 | MAN-SEC::TIM-10 |
| TIM-11 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::TIM-11 | MAN-UX::TIM-11 |
| TIM-12 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::TIM-12 + AUTO-MODEL::TIM-12 | MAN-UX::TIM-12 |
| CMP-01 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::CMP-01 + AUTO-ISO::CMP-01 | MAN-SEC::CMP-01 |
| CMP-02 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::CMP-02 | MAN-UX::CMP-02 |
| CMP-03 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::CMP-03 | MAN-A11Y-KB::CMP-03 + MAN-A11Y-SR::CMP-03 |
| CMP-04 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::CMP-04 |
| CMP-05 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::CMP-05 + AUTO-ISO::CMP-05 | MAN-SEC::CMP-05 + MAN-A11Y-KB::CMP-05 + MAN-A11Y-SR::CMP-05 |
| CMP-06 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::CMP-06 + AUTO-ISO::CMP-06 | MAN-SEC::CMP-06 |
| CMP-07 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::CMP-07 + AUTO-ISO::CMP-07 | MAN-SEC::CMP-07 |
| CMP-08 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::CMP-08 |
| CMP-09 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::CMP-09 + AUTO-MODEL::CMP-09 | — |
| CMP-10 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::CMP-10 + AUTO-MODEL::CMP-10 | — |
| CMP-11 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::CMP-11 |
| CMP-12 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::CMP-12 + AUTO-ISO::CMP-12 + AUTO-MODEL::CMP-12 | MAN-SEC::CMP-12 |
| THR-01 | RELEASE_BLOCKING | AUTOMATED | AW-010 | AUTO-E2E::THR-01 | — |
| THR-02 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::THR-02 | MAN-UX::THR-02 |
| THR-03 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::THR-03 | MAN-A11Y-KB::THR-03 + MAN-A11Y-SR::THR-03 |
| THR-04 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::THR-04 + AUTO-REL::THR-04 | — |
| THR-05 | RELEASE_BLOCKING | AUTOMATED | AW-010 | AUTO-E2E::THR-05 | — |
| THR-06 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::THR-06 | MAN-UX::THR-06 |
| THR-07 | RELEASE_BLOCKING | AUTOMATED | AW-010 | AUTO-E2E::THR-07 | — |
| THR-08 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::THR-08 + AUTO-REL::THR-08 | — |
| THR-09 | RELEASE_BLOCKING | AUTOMATED | AW-010 | AUTO-E2E::THR-09 | — |
| RCT-01 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::RCT-01 | MAN-A11Y-KB::RCT-01 + MAN-A11Y-SR::RCT-01 |
| RCT-02 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::RCT-02 | MAN-UX::RCT-02 |
| RCT-03 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::RCT-03 + AUTO-REL::RCT-03 | — |
| RCT-04 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::RCT-04 | MAN-UX::RCT-04 |
| RCT-05 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::RCT-05 + AUTO-ISO::RCT-05 | — |
| RCT-06 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::RCT-06 |
| EDT-01 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::EDT-01 + AUTO-ISO::EDT-01 | MAN-SEC::EDT-01 |
| EDT-02 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::EDT-02 | MAN-A11Y-KB::EDT-02 + MAN-A11Y-SR::EDT-02 |
| EDT-03 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::EDT-03 | MAN-UX::EDT-03 |
| EDT-04 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::EDT-04 + AUTO-ISO::EDT-04 | MAN-SEC::EDT-04 |
| EDT-05 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::EDT-05 | MAN-UX::EDT-05 |
| EDT-06 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::EDT-06 + AUTO-ISO::EDT-06 + AUTO-REL::EDT-06 | MAN-SEC::EDT-06 |
| EDT-07 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::EDT-07 |
| EDT-08 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::EDT-08 + AUTO-ISO::EDT-08 | MAN-SEC::EDT-08 |
| EDT-09 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::EDT-09 | MAN-UX::EDT-09 |
| URD-01 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-MODEL::URD-01 | — |
| URD-02 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-MODEL::URD-02 | MAN-UX::URD-02 |
| URD-03 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-MODEL::URD-03 | — |
| URD-04 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-MODEL::URD-04 | MAN-UX::URD-04 |
| URD-05 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-MODEL::URD-05 | MAN-UX::URD-05 |
| URD-06 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-MODEL::URD-06 + AUTO-ISO::URD-06 | MAN-SEC::URD-06 |
| URD-07 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-MODEL::URD-07 | — |
| URD-08 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-MODEL::URD-08 | MAN-UX::URD-08 |
| URD-09 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-MODEL::URD-09 + AUTO-REL::URD-09 | — |
| URD-10 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-MODEL::URD-10 | — |
| FIL-01 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::FIL-01 | MAN-UX::FIL-01 |
| FIL-02 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::FIL-02 | MAN-UX::FIL-02 |
| FIL-03 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::FIL-03 + AUTO-ISO::FIL-03 | — |
| FIL-04 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::FIL-04 | MAN-UX::FIL-04 |
| FIL-05 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::FIL-05 + AUTO-ISO::FIL-05 | — |
| FIL-06 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::FIL-06 |
| FIL-07 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::FIL-07 | MAN-UX::FIL-07 |
| FIL-08 | RELEASE_BLOCKING | AUTOMATED | AW-010 | AUTO-E2E::FIL-08 | — |
| FIL-09 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::FIL-09 + AUTO-ISO::FIL-09 | — |
| FIL-10 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::FIL-10 | MAN-A11Y-KB::FIL-10 + MAN-A11Y-SR::FIL-10 |
| FIL-11 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::FIL-11 + AUTO-ISO::FIL-11 | — |
| SRC-01 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::SRC-01 | MAN-A11Y-KB::SRC-01 + MAN-A11Y-SR::SRC-01 |
| SRC-02 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::SRC-02 + AUTO-ISO::SRC-02 | — |
| SRC-03 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::SRC-03 | MAN-UX::SRC-03 |
| SRC-04 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::SRC-04 | MAN-UX::SRC-04 |
| SRC-05 | RELEASE_BLOCKING | HYBRID | AW-010 | AUTO-E2E::SRC-05 | MAN-UX::SRC-05 |
| SRC-06 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::SRC-06 + AUTO-ISO::SRC-06 | — |
| SRC-07 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::SRC-07 + AUTO-ISO::SRC-07 | — |
| SRC-08 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::SRC-08 + AUTO-ISO::SRC-08 | MAN-SEC::SRC-08 + MAN-A11Y-KB::SRC-08 + MAN-A11Y-SR::SRC-08 |
| SRC-09 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::SRC-09 |
| NTF-01 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::NTF-01 + AUTO-ISO::NTF-01 | MAN-SEC::NTF-01 |
| NTF-02 | NON_WAIVABLE | HYBRID | AW-010 | AUTO-E2E::NTF-02 + AUTO-ISO::NTF-02 | MAN-SEC::NTF-02 |
| NTF-03 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::NTF-03 |
| NTF-04 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::NTF-04 |
| NTF-05 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::NTF-05 | — |
| NTF-06 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::NTF-06 + AUTO-ISO::NTF-06 | — |
| NTF-07 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::NTF-07 + AUTO-ISO::NTF-07 | — |
| NTF-08 | NON_WAIVABLE | AUTOMATED | AW-010 | AUTO-E2E::NTF-08 + AUTO-REL::NTF-08 | — |
| NTF-09 | TRACKED_POLISH | MANUAL | AW-010 | — | MAN-UX::NTF-09 |
| PRS-01 | NON_WAIVABLE | HYBRID | AW-011 | AUTO-REL::PRS-01 + AUTO-ISO::PRS-01 | MAN-SEC::PRS-01 |
| PRS-02 | TRACKED_POLISH | MANUAL | AW-011 | — | MAN-UX::PRS-02 |
| PRS-03 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::PRS-03 | — |
| PRS-04 | RELEASE_BLOCKING | AUTOMATED | AW-011 | AUTO-REL::PRS-04 | — |
| PRS-05 | TRACKED_POLISH | MANUAL | AW-011 | — | MAN-UX::PRS-05 |
| PRS-06 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::PRS-06 + AUTO-ISO::PRS-06 | — |
| PRS-07 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::PRS-07 + AUTO-ISO::PRS-07 | — |
| ADM-01 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ADM-01 + AUTO-ISO::ADM-01 | MAN-SEC::ADM-01 |
| ADM-02 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::ADM-02 | MAN-UX::ADM-02 |
| ADM-03 | RELEASE_BLOCKING | HYBRID | AW-009 | AUTO-E2E::ADM-03 | MAN-UX::ADM-03 |
| ADM-04 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ADM-04 + AUTO-ISO::ADM-04 | MAN-SEC::ADM-04 |
| ADM-05 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ADM-05 + AUTO-ISO::ADM-05 | MAN-SEC::ADM-05 |
| ADM-06 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ADM-06 + AUTO-ISO::ADM-06 | MAN-SEC::ADM-06 |
| ADM-07 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::ADM-07 |
| ADM-08 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ADM-08 + AUTO-ISO::ADM-08 | MAN-SEC::ADM-08 |
| ADM-09 | NON_WAIVABLE | HYBRID | AW-009 | AUTO-E2E::ADM-09 + AUTO-ISO::ADM-09 | MAN-SEC::ADM-09 |
| ADM-10 | TRACKED_POLISH | MANUAL | AW-009 | — | MAN-UX::ADM-10 |
| STA-E01 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-E01 |
| STA-E02 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-E02 |
| STA-E03 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-E03 |
| STA-L01 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::STA-L01 + AUTO-ISO::STA-L01 | MAN-SEC::STA-L01 |
| STA-L02 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-L02 |
| STA-L03 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-L03 |
| STA-L04 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::STA-L04 | MAN-UX::STA-L04 |
| STA-R01 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::STA-R01 + AUTO-ISO::STA-R01 | MAN-SEC::STA-R01 |
| STA-R02 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-R02 |
| STA-R03 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::STA-R03 + AUTO-MODEL::STA-R03 | MAN-UX::STA-R03 |
| STA-R04 | NON_WAIVABLE | AUTOMATED | AW-012 | AUTO-E2E::STA-R04 + AUTO-MODEL::STA-R04 | — |
| STA-P01 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::STA-P01 + AUTO-ISO::STA-P01 | MAN-SEC::STA-P01 |
| STA-P02 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::STA-P02 + AUTO-ISO::STA-P02 | MAN-SEC::STA-P02 |
| STA-P03 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::STA-P03 |
| NET-01 | RELEASE_BLOCKING | HYBRID | AW-011 | AUTO-REL::NET-01 | MAN-UX::NET-01 |
| NET-02 | NON_WAIVABLE | HYBRID | AW-011 | AUTO-REL::NET-02 + AUTO-ISO::NET-02 + AUTO-MODEL::NET-02 | MAN-SEC::NET-02 |
| NET-03 | NON_WAIVABLE | HYBRID | AW-011 | AUTO-REL::NET-03 + AUTO-MODEL::NET-03 | MAN-UX::NET-03 |
| NET-04 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::NET-04 | — |
| NET-05 | NON_WAIVABLE | HYBRID | AW-011 | AUTO-REL::NET-05 + AUTO-ISO::NET-05 + AUTO-MODEL::NET-05 | MAN-SEC::NET-05 |
| NET-06 | NON_WAIVABLE | HYBRID | AW-011 | AUTO-REL::NET-06 + AUTO-MODEL::NET-06 | MAN-UX::NET-06 |
| NET-07 | RELEASE_BLOCKING | HYBRID | AW-011 | AUTO-REL::NET-07 | MAN-UX::NET-07 |
| NET-08 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::NET-08 | — |
| NET-09 | NON_WAIVABLE | HYBRID | AW-011 | AUTO-REL::NET-09 + AUTO-ISO::NET-09 | MAN-SEC::NET-09 |
| NET-10 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::NET-10 + AUTO-MODEL::NET-10 | — |
| NET-11 | NON_WAIVABLE | AUTOMATED | AW-011 | AUTO-REL::NET-11 | — |
| A11Y-01 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-01 | MAN-A11Y-KB::A11Y-01 + MAN-A11Y-SR::A11Y-01 |
| A11Y-02 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-02 | MAN-A11Y-KB::A11Y-02 + MAN-A11Y-SR::A11Y-02 |
| A11Y-03 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-03 | MAN-A11Y-KB::A11Y-03 + MAN-A11Y-SR::A11Y-03 |
| A11Y-04 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-04 | MAN-A11Y-KB::A11Y-04 + MAN-A11Y-SR::A11Y-04 |
| A11Y-05 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-05 | MAN-A11Y-KB::A11Y-05 + MAN-A11Y-SR::A11Y-05 |
| A11Y-06 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-A11Y::A11Y-06 | MAN-A11Y-KB::A11Y-06 + MAN-A11Y-SR::A11Y-06 |
| A11Y-07 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-A11Y::A11Y-07 | MAN-A11Y-KB::A11Y-07 + MAN-A11Y-SR::A11Y-07 |
| A11Y-08 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-A11Y::A11Y-08 | MAN-A11Y-KB::A11Y-08 + MAN-A11Y-SR::A11Y-08 |
| A11Y-09 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-A11Y::A11Y-09 | MAN-A11Y-KB::A11Y-09 + MAN-A11Y-SR::A11Y-09 |
| A11Y-10 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-10 | MAN-A11Y-KB::A11Y-10 + MAN-A11Y-SR::A11Y-10 |
| A11Y-11 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-A11Y::A11Y-11 | MAN-A11Y-KB::A11Y-11 + MAN-A11Y-SR::A11Y-11 |
| A11Y-12 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-A11Y::A11Y-12 | MAN-A11Y-KB::A11Y-12 + MAN-A11Y-SR::A11Y-12 |
| RWD-01 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-01 | MAN-RWD::RWD-01 |
| RWD-02 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-02 | MAN-RWD::RWD-02 |
| RWD-03 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-03 | MAN-RWD::RWD-03 |
| RWD-04 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-04 | MAN-RWD::RWD-04 |
| RWD-05 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-05 | MAN-RWD::RWD-05 |
| RWD-06 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-06 | MAN-RWD::RWD-06 |
| RWD-07 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::RWD-07 | MAN-RWD::RWD-07 |
| RWD-08 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-RWD::RWD-08 |
| RWD-09 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-RWD::RWD-09 |
| POL-01 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::POL-01 |
| POL-02 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::POL-02 |
| POL-03 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::POL-03 |
| POL-04 | TRACKED_POLISH | MANUAL | AW-012 | — | MAN-UX::POL-04 |
| POL-05 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::POL-05 + AUTO-ISO::POL-05 | MAN-SEC::POL-05 |
| POL-06 | NON_WAIVABLE | HYBRID | AW-012 | AUTO-E2E::POL-06 + AUTO-ISO::POL-06 | MAN-SEC::POL-06 |
| POL-07 | RELEASE_BLOCKING | HYBRID | AW-012 | AUTO-E2E::POL-07 | MAN-UX::POL-07 |

## 5. First-release bootstrap for the 30-run history gate

The “last 30 nightly backup jobs = 30/30” rule in
[`chat-test-strategy.md` §9.1](../quality/chat-test-strategy.md) is operational
history and is **not** another UX criterion ID. It remains non-waivable, but a
new deployment cannot possess history from before its production-equivalent
backup pipeline existed. Use this bounded bootstrap rather than inventing 30
runs or granting a waiver:

1. **Normal rule:** after 30 scheduled nightly opportunities exist, the 30 most
   recent scheduled jobs must be 30/30 successful. Manually triggered or
   accelerated jobs never count toward that denominator.
2. **Bootstrap entry:** record `backup_history_started_at` when the
   production-equivalent scheduled pipeline, storage, retention, monitoring,
   and alert route are all enabled. Bootstrap may start only once; changing a
   schedule or resetting the counter does not erase failures.
3. **Earliest initial release:** require at least seven consecutive scheduled
   nightlies and every available scheduled result successful (`n/n`, `7 <= n <
   30`). A failed, missed, disabled, or unclassified scheduled run fails the
   gate; infrastructure failures are not silently removed from the denominator.
4. **Compensating proof:** before the initial release, complete three full
   restores from three distinct scheduled backup IDs created on at least three
   different calendar dates, including the oldest available and newest
   available backup. Each restore uses a clean disposable environment and must
   pass the §9.1 RPO/RTO, row/checksum, tenant-isolation, search/file,
   attachment, cursor-resume, and new-message checks. These restores supplement
   confidence but do not count as nightly runs.
5. **Manifest fields:** `AW-012` records `bootstrap=true`,
   `backup_history_started_at`, `history_observed=n`, `history_success=n`,
   `history_required=30`, `bootstrap_remaining=30-n`, all backup/restore IDs,
   alert-drill result, and artifact links in the release manifest.
6. **Transition:** scheduled collection continues without reset. Every release
   candidate while `n < 30` must still have all available runs successful and a
   fresh successful restore of the newest backup. At the 30th scheduled
   opportunity bootstrap expires automatically and the normal rolling 30/30
   rule applies.
7. **Failure behavior:** any failed/missed scheduled job, failed restore,
   checksum/isolation error, or RPO/RTO miss blocks release. The bootstrap
   changes only the amount of history that can exist; it does not waive backup
   correctness or restore evidence.

## 6. Validation algorithm and command

Run from the repository root. The command extracts source IDs independently,
parses only complete registry rows, proves one-to-one set equality and
uniqueness, validates tier totals/evidence-mode artifact shape/owner cards, and
asserts that the four required risk floors remain non-waivable.

```bash
python3 - <<'PY'
from collections import Counter
from pathlib import Path
import re

source = Path("docs/product/chat-ux-acceptance.md").read_text()
registry = Path("docs/product/chat-ux-gate-registry.md").read_text()
ID = r"[A-Z][A-Z0-9-]*\d{2}"
source_ids = re.findall(rf"(?m)^-\s+\*\*({ID}):\*\*\s+", source)
row_re = re.compile(
    rf"(?m)^\|\s*({ID})\s*\|\s*"
    r"(NON_WAIVABLE|RELEASE_BLOCKING|TRACKED_POLISH)\s*\|\s*"
    r"(AUTOMATED|MANUAL|HYBRID)\s*\|\s*"
    r"(AW-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$"
)
rows = row_re.findall(registry)
registry_ids = [row[0] for row in rows]

def duplicates(values):
    return sorted(key for key, count in Counter(values).items() if count != 1)

assert len(source_ids) == len(set(source_ids)) == 179, (len(source_ids), duplicates(source_ids))
assert len(registry_ids) == len(set(registry_ids)) == 179, (len(registry_ids), duplicates(registry_ids))
assert set(source_ids) == set(registry_ids), {
    "missing": sorted(set(source_ids) - set(registry_ids)),
    "extra": sorted(set(registry_ids) - set(source_ids)),
}
expected_tiers = {"NON_WAIVABLE": 91, "RELEASE_BLOCKING": 54, "TRACKED_POLISH": 34}
actual_tiers = Counter(row[1] for row in rows)
assert actual_tiers == expected_tiers, actual_tiers
assert {row[3] for row in rows} <= {"AW-009", "AW-010", "AW-011", "AW-012"}
for cid, _, evidence_mode, _, automated, manual in rows:
    has_auto, has_manual = automated != "—", manual != "—"
    assert (has_auto, has_manual) == {
        "AUTOMATED": (True, False),
        "MANUAL": (False, True),
        "HYBRID": (True, True),
    }[evidence_mode], (cid, evidence_mode, automated, manual)
    if has_auto: assert f"::{cid}" in automated, (cid, automated)
    if has_manual: assert f"::{cid}" in manual, (cid, manual)

privacy_authorization = set("""
ONB-05 ONB-06 ONB-08 NAV-02 NAV-03 NAV-05 NAV-07 NAV-11 NAV-12
TIM-08 TIM-10 CMP-01 CMP-05 CMP-06 CMP-07 CMP-12 RCT-05
EDT-01 EDT-04 EDT-06 EDT-08 URD-06 FIL-03 FIL-05 FIL-09 FIL-11
SRC-02 SRC-06 SRC-07 SRC-08 NTF-01 NTF-02 NTF-06 NTF-07
PRS-01 PRS-06 PRS-07 ADM-01 ADM-04 ADM-05 ADM-06 ADM-08 ADM-09
STA-L01 STA-R01 STA-P01 STA-P02 NET-02 NET-05 NET-09 POL-05 POL-06
""".split())
durable_send_truth = set("""
TIM-01 TIM-12 CMP-09 CMP-10 CMP-12 STA-R03 STA-R04
NET-02 NET-03 NET-05 NET-06 NET-10
""".split())
reconnect_convergence = set("""
THR-04 THR-08 RCT-03 EDT-06 URD-09 NTF-08 PRS-03
NET-04 NET-08 NET-10 NET-11
""".split())
core_keyboard_screen_reader = set("""
ONB-09 TIM-07 CMP-03 CMP-05 THR-03 RCT-01 EDT-02 FIL-10 SRC-01 SRC-08
A11Y-01 A11Y-02 A11Y-03 A11Y-04 A11Y-05 A11Y-10 A11Y-11
""".split())
tier_by_id = {row[0]: row[1] for row in rows}
floor = privacy_authorization | durable_send_truth | reconnect_convergence | core_keyboard_screen_reader
assert floor <= set(source_ids), sorted(floor - set(source_ids))
assert all(tier_by_id[cid] == "NON_WAIVABLE" for cid in floor), sorted(
    cid for cid in floor if tier_by_id[cid] != "NON_WAIVABLE"
)
print(f"PASS source={len(source_ids)} registry={len(registry_ids)} tiers={expected_tiers}")
PY
```

Expected output for this revision:

```text
PASS source=179 registry=179 tiers={'NON_WAIVABLE': 91, 'RELEASE_BLOCKING': 54, 'TRACKED_POLISH': 34}
```
