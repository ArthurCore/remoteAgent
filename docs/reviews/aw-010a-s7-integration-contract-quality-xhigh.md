# AW-010A S7 Integration Contract Quality/Reliability Review — xhigh

Status: **APPROVED**

## S7-QR-1 closure

The patched S7 card now makes the specification review authoritative for the exact ordered 20-test denominator and executable teardown contract. The specification closes S7-QR-1 without widening implementation scope:

- While the harness is live, teardown captures the run ID, exact labels/resources, all generated role names and three connection URLs, evidence path, and expected evidence.
- Before stop, a failure-collecting evidence stage requires `lstat` proof of a regular non-symlink file at mode `0600`, complete-byte validation against the exact expected JSON, a `writeFile` probe with `flag: "wx"` that must fail with `EEXIST`, an exact byte-for-byte re-read, and complete serialized-byte credential scans for every generated role, every connection URL, PostgreSQL URI/userinfo or credential-bearing forms, and password/secret field names.
- A guaranteed cleanup stage calls `harness.stop()` exactly once whenever startup returned a harness, regardless of evidence failures.
- After the stop attempt, an independent parent-process read-back uses dependency-free `node:child_process` `execFile` against the container CLI, supplies each captured exact label as a separate argument, and requires zero running or stopped matches for the captured labels/run ID even when evidence inspection or stop fails. It forbids a bare `testcontainers` import and shell-command interpolation and leaves DB support unchanged.
- Failures are retained in deterministic evidence → stop → residue order. A sole failure is thrown unchanged; multiple failures use one `AggregateError`; no stage can mask or prevent either later stage.

The specification retains exactly 20 unique direct literal `AW010A-S7` tests, the sole integration-test path and exact API project shape, and the existing no-new-manifest/lockfile/DB-support/direct-API-`pg`/Testcontainers-dependency boundaries. No quality or reliability blocker remains.
