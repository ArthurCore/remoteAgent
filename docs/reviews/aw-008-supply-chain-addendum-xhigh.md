# AW-008 Supply-Chain Addendum Review — xhigh

## Basis

- Reviewed only the amendment atop approved plan commit `089d89f`: three transitive build denials, `pnpm-workspace.yaml` ownership/tree coverage, and F0's frozen-install proof.
- The lock resolves `protobufjs@7.6.5`, `ssh2@1.17.0`, and `cpu-features@0.0.10` only through the approved Testcontainers development graph.

## Supply-chain determination

- Exact-version `allowBuilds` matchers set to `false` are the least-privilege reproducible choice. They retain the existing explicit `esbuild: true`, execute none of these transitive lifecycle scripts, and make a future unreviewed version fail closed rather than inherit approval.
- `protobufjs` postinstall only reads package metadata and may emit version-scheme guidance; denying it removes install-time execution without removing generated/runtime code.
- `ssh2` install only attempts its optional native crypto addon. Its source catches an absent addon and selects the Node-crypto/bundled JS path.
- `cpu-features` is an optional native probe; `ssh2` catches its absence and uses conservative cipher ordering. It affects optimization, not protocol correctness.
- The approved local/PostgreSQL path uses the local Docker API, not Testcontainers' SSH forwarding path. Native-addon-free behavior is therefore sufficient for the required container lifecycle and PostgreSQL tests; no production runtime capability is being removed.

## Plan and ownership

- Adding tracked `pnpm-workspace.yaml` to AW-008F/F0 ownership closes the policy-file omission: pnpm 11 reads `allowBuilds` there, and no other AW-008 subcard owns workspace policy.
- This changes no D1–D6 decision, dependency pin, card count, dependency edge, merge order, or execution-board status. It creates no card/path conflict and requires no board edit.

## Mandatory evidence and authorization

- Before F0 closes, apply the three exact-version `false` entries and run `CI=true pnpm install --frozen-lockfile`; it must exit 0, resolve those exact versions, and leave both lockfile and workspace policy byte-unchanged by the install.
- AW-008D must later run the real `pnpm test:integration` Testcontainers lane under this denial policy and record locked-image start, PostgreSQL connection/use, and zero-resource cleanup. Failure blocks D/AW-008 closure; it does not justify silently enabling a build.
- Subject to the F0 install proof above, the parent may apply this policy and complete F0.

Verdict: APPROVED
