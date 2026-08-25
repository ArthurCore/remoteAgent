# AW-008A0 Payload Contract Closure Review — xhigh

## Scope, authority, and decision

- Reviewed only corrected `docs/contracts/durable-event-payloads-v1.md` (A0) against `docs/reviews/aw-008-payload-contract-review-xhigh.md` at baseline `fa0372f` plus the stated uncommitted work.
- Authority notation: `S` = `docs/contracts/sync-contract-v1.md`; `P` = `docs/contracts/chat-projection-semantics-v1.md`; `A` = `docs/architecture/chat-core-adr.md`. Authority order remains `S`, `P`, then `A` (`A:9-11`; A0:9-15).
- **AW-008A0-R1: APPROVE.** The unchanged corrected A0 is sufficiently exact and executable for its payload-contract scope.

## Prior-finding closure

| ID | Prior severity | Status | Exact corrected-document and authority lines |
|---|---|---|---|
| B-01 | BLOCKER | **RESOLVED** | A0 now requires strict `ResolvedMentionItemV1` (`A0:23`) and requires `resolved_mention_items` on create/edit with both-column uniqueness and exact principal-set equality (`A0:44-50,54-61`). It fixes the ID to the logical epoch/viewer/message key and requires reuse across edits/remove-readd within that epoch (`A0:61`), assigns parser versus stateful ownership (`A0:105-106`), demonstrates stable create/edit IDs (`A0:124-125`), and tests same-event and cross-history failures (`A0:142-143,159`). This supplies the identity required by the authoritative stable key/item (`P:397-417,457`), item-addressed acknowledgement (`P:229-237,444,741`), create/edit projection (`P:701-709`), and inbox output (`P:772-781`). |
| H-01 | HIGH | **RESOLVED** | Join now requires the principal inactive immediately before join, exactly one active epoch afterward, a fresh never-used sole epoch, and a different fresh epoch on rejoin (`A0:79-85`); active-principal rejoin is a stateful negative (`A0:155`). This matches current-epoch/rejoin authority (`P:84-98,120`) and the reducer precondition/no-backfill behavior (`P:717-721`). |
| M-01 | MEDIUM | **RESOLVED** | `VersionAfterCreateV1` is a JSON number restricted to the positive safe-integer range `2..9007199254740991` (`A0:21`), both edit and delete use it while retaining exact prior-plus-one (`A0:52-68`), and overflow is a parse negative (`A0:140`). This is a compatible exact restriction of authoritative JSON-number next versions (`P:172-181`) for the required JavaScript/Zod runtime (`S:124-149`). |
| M-02 | MEDIUM | **RESOLVED** | Ownership is explicit and disjoint across Zod/context-free parse, stateful validator/reducer, and projection/delivery (`A0:103-107`); fixture prerequisites and non-exhaustiveness are explicit (`A0:133-135`); all 21 negatives are phase-labelled—11 `parse`, 10 `stateful`—and include the required history cases (`A0:137-159`). The handoff forbids Zod widening or history/behavior claims (`A0:163-165`), consistent with strict event parsing (`S:116-126`) and authoritative stateful/delivery rules (`P:696-728,124-133`). |

## Contract execution audit

- **Seven-event alignment PASS:** exactly seven registry rows (`A0:28-38`), seven matching §4 headings (`A0:42,52,63,70,79,87,95`), and seven positive JSONL fragments in the same event order (`A0:119-130`).
- **Exact fields PASS:** payload closure and requiredness are universal (`A0:23-24`). Create is exactly `message_id,thread_root_id,version,resolved_mention_principal_ids,resolved_mention_items` (`A0:44-50`); edit is exactly `message_id,version,resolved_mention_principal_ids,resolved_mention_items` (`A0:54-59`). These retain the authoritative principal-ID fields (`P:165-176`) while adding the projection-critical mapping allowed by `P:203`.
- **Mention invariants PASS:** same-event set equality and uniqueness are context-free (`A0:50,59,61,105,141-143`); stable ID across canonical history is stateful (`A0:61,106,159`).
- **Fixture audit PASS:** seven positives align to the registry (`A0:124-130`); 21 meaningful negatives cover parser/local and canonical stateful failures (`A0:139-159`).
- **No false Zod claim PASS:** A0 expressly limits Zod to context-free parsing and assigns history and delivery elsewhere (`A0:105-107,135,165`).
- The previously accepted strict-minimal seven-event scope remains closed: A0 names the required mention identity while leaving additive body/attachment/display data out (`A0:15,165`), with no conflict against the additive allowance at `P:203`.

## Remaining severity and runtime gate

- Remaining findings: **BLOCKER 0; HIGH 0; MEDIUM 0; LOW 0.**
- Runtime Zod implementation **MAY START** from the unchanged corrected A0. It must implement only the strict registry/context-free checks in `A0:105,165`; stateful and projection/delivery enforcement remain separate per `A0:106-107`.

Verdict: APPROVED
