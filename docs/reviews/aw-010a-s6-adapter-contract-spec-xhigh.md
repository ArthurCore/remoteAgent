# AW-010A S6 adapter contract specification review

PASS

No blocking completeness or consistency defects remain in the corrected frozen S6 card.

- The adapter boundary is coherent with the chat-core port: the caller retains transaction authority, the adapter exports a narrow transaction query capability without a direct `pg`/`@types/pg` dependency, and no controller or adapter transaction control is permitted.
- Actor authorization is frozen before allocation: human/service lookup is tenant-leading, exact-kind, exactly-one-row, and `FOR SHARE`; only `system:channel-lifecycle` bypasses lookup, while forged system actors fail before queries.
- Validation and precision are closed: one generated ID and one clock value feed an explicitly constructed dummy positive-sequence envelope, exact `DurableEventV1` validation precedes sequence access, canonical UTC is capped at six fractional digits, and the actual-sequence envelope is validated again.
- Allocation is bigint-safe and transactional: tenant-leading text reads use `FOR UPDATE`, max/missing states have fixed classifications, the guarded update avoids `Number`, and a zero-row update is re-read under lock and fails closed when it cannot be reclassified.
- Insert cardinality, the ten server-envelope columns, casts, returned identity/sequence checks, bigint result, injected timestamp, fixed error codes, and row-free diagnostics are specified without conflicting with the parent contract.
- The acceptance denominator is exactly **16 unique `AW010A-S6` fake-client tests**; the targeted green command is therefore **16/16**, while API unit scope is frozen to the existing health regression plus those 16 tests.
- API configuration remains fail-closed: S6 adds only the unit project, and `test:integration` must fail with `No projects matched` until S7 adds the real integration project.
- Scope is exact: six implementation paths, one API importer link to `../../packages/chat-core`, no `pg` dependencies, and no lockfile lifecycle/build-policy or resolution changes.
