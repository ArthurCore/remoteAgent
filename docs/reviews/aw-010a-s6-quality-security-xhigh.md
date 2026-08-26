# AW-010A S6 Quality and Security Review — xhigh

Status: APPROVED

## Verdict

The prior HIGH accessor-TOCTOU finding is closed. No remaining quality or security finding was identified in the current S6 scope.

The adapter now snapshots caller-controlled input through own property descriptors before authorization or event construction. The original changing-getter shape cannot become the allowlisted lifecycle system actor: the actor accessors are rejected without invocation, before any query or generator call. Accepted actor data descriptors are reflected once into local values and are never read from the caller object again.

## Closure assessment

- `readActor` accepts only non-array objects whose prototype is exactly `Object.prototype` or `null`, requires exactly the own string keys `kind` and `principalId`, and obtains each field from one own data-property descriptor. Accessors, inherited-only fields, custom prototypes, symbols, and extra own keys fail with `CHANNEL_ACTOR_INVALID`.
- Actor reflection is wrapped at `Array.isArray`, `Object.getPrototypeOf`, `Reflect.ownKeys`, and `Object.getOwnPropertyDescriptor`. Throwing and revoked proxies—including a trap that throws an exported `PostgresChannelEventJournalError` instance—are relabeled to a fresh fixed `CHANNEL_ACTOR_INVALID` error. The hostile error is not preserved as `cause`, and its code/message do not escape.
- Top-level `tenantId`, `channelId`, `actor`, and `intent` are read as own data descriptors. Intent requires a plain/null-prototype exact two-key shape, and payloads are recursively copied from enumerable own data descriptors into fresh records/arrays. Getter, proxy-reflection, cycle, symbol/function/bigint/non-finite-number, boxed primitive, and other exotic-object cases fail as fixed `CHANNEL_EVENT_INVALID` before query or generator effects.
- Extra top-level envelope properties remain intentionally ignored. An enumerable throwing getter on an extra property is not inspected or invoked, while the append uses only the four named input fields.
- Snapshot/reflection failures expose only the fixed error name, code, and message; no caller secret, reflected exception, row data, or own `cause` is retained.

## Regression assessment

The remainder of the adapter remains fail-closed and consistent with the previously reviewed S6 contract:

- Actor lookup remains schema-qualified, parameterized, tenant-leading, and protected by `FOR SHARE`; only the exact `system:channel-lifecycle` snapshot skips it.
- Event prevalidation still uses one generated ID and one canonical microsecond-or-less UTC clock value, constructs rather than spreads the envelope, and validates both dummy and actual-sequence events with `DurableEventV1` before insertion.
- Sequence allocation remains a tenant-leading `FOR UPDATE` lock, bounded canonical text-to-`bigint` parsing, exact guarded increment, and zero-row-only status re-read. Missing, exhausted, malformed, and inconsistent states retain their fixed classifications.
- Insert SQL still names exactly ten columns, uses positional parameters and explicit JSON serialization, and verifies exact returned cardinality, sequence, and event ID.
- Error messages remain fixed and row-free. Query/generator rejection behavior is unchanged, and the adapter still issues no `BEGIN`, `COMMIT`, or `ROLLBACK`; transaction ownership remains with the caller.
- The cumulative checker freezes the five S6 file hashes, exact 16-test inventory, snapshot/adversarial semantic tokens, SQL literals, error codes, API manifest/config/importer, and prior gates without an observed weakening.

## Verification evidence

Independent defensive probe against the current adapter: **passed**.

```text
{"status":"PASS","changingGetterReads":[0,0],"actorDescriptorReads":{"kind":1,"principalId":1},"actorShapes":"plain/null/exact","reflectionErrors":"fixed","invalidEventCases":18,"ignoredGetterReads":0}
```

Current local commands:

- Focused S6: **16/16 passed**.
- API lint: **passed**.
- API typecheck: **passed**.
- API unit project: **20/20 passed**.
- API integration at S6: **exit 1 as required**, `No projects matched the filter "integration"`.
- Scaffold checker: **exit 0**, `116 required files`.
- Root uncached CI: **exit 0**, all Turbo tasks successful and **0 cached**.

Parent gate evidence supplied for this closure is consistent with the rerun: **S6 16 / API 20 / DB 49 / root CI 0 / scaffold 116**.
