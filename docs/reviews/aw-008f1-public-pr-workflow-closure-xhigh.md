# AW-008F1 Public PR Workflow Closure — xhigh

## Scope and authority

- Repository: `ArthurCore/remoteAgent`, public, Apache-2.0.
- Pull request: `https://github.com/ArthurCore/remoteAgent/pull/1`.
- Corrected PR head: `2bbb0f1016a37947e9f3172f64c0a4ed1078a7df`.
- Authoritative hosted run: `https://github.com/ArthurCore/remoteAgent/actions/runs/32872753268`.
- This record closes only the actual GitHub-hosted PR requirement left open as B1 in the earlier F1 review. Local gates do not substitute for the evidence below.

## Failure-to-correction ledger

| Hosted evidence | Actual result | Classification and correction |
|---|---|---|
| Private-era run `32853549929` | `runner_id=0`, zero steps, zero artifacts | Pre-runner billing/provisioning failure, not a code result. The user selected public release without enabling paid usage. |
| Public rerun of run `32865530090` | Runner assigned; checkout passed; setup-node failed before Corepack | `actions/setup-node` automatic package-manager caching invoked pnpm before Corepack. Commit `a59767ad88e371bab784cc405f84c806889737ff` set semantic `package-manager-cache: false` and pinned the exact workflow checker. |
| Run `32867150873` | Setup and frozen install passed; contracts unit script selected no files on Ubuntu | pnpm used Ubuntu `/bin/sh` (`dash`), which does not expand Bash braces. Commit `c0bc49394207ab1b75a42444d31376700b0079dc` replaced the brace expression with the same three explicit test paths in plan, manifest, and checker. |
| Run `32868382244` | Uncached CI passed; integration reached 24/25; evidence upload succeeded | Docker list state lagged after an awaited fixture stop, before the janitor was called. Commit `2bbb0f1016a37947e9f3172f64c0a4ed1078a7df` added a strict test-only precondition convergence gate; production cleanup stayed unchanged. |

Every correction passed focused spec and quality/security review before commit. The final janitor correction additionally passed 20/20 fresh-process focused runs, three fresh-process full local integration runs at 25/25 with residue zero, a retained 25/25 run with two mode-`0600` JSON files, and uncached local CI.

## Three hosted successes at one immutable head

| Attempt | Job | Runner | Conclusion | Artifact captured at attempt |
|---:|---:|---:|---|---:|
| 1 | `97883444019` | `1000002216` | SUCCESS | `9572770997` |
| 2 | `97884660831` | `1000002217` | SUCCESS | `9572915092` |
| 3 | `97885762628` | `1000002218` | SUCCESS | `9573036526` |

All three attempts used pull-request head `2bbb0f1016a37947e9f3172f64c0a4ed1078a7df`. In every attempt:

- checkout, Node setup, Corepack/pnpm pinning, frozen install, uncached CI, Testcontainers integration, evidence upload, and post-job stages concluded successfully;
- raw job-log parsing confirmed contracts `184/184`, DB unit `64/64`, contract artifacts `81/81`, and integration `25/25` across three files;
- four Turbo task groups reported cache zero and no failure marker was present;
- the uploaded `aw008d-testcontainers-evidence` artifact downloaded as exactly two valid JSON documents with sixteen top-level fields each and zero provider-token, private-key, or credential-URL pattern matches.

The current attempt-3 artifact is `9573036526`, 1,592 bytes, unexpired, created `2026-08-25T16:43:55Z`, and scheduled to expire `2026-11-23T16:41:32Z`. GitHub keeps the current rerun artifact for this run; each prior attempt artifact was downloaded and validated before the next rerun replaced the run-scoped artifact listing.

## Workflow invariants and informational annotation

- Workflow permissions remain `contents: read` only.
- Checkout, setup-node, and upload-artifact references remain immutable 40-hex SHAs.
- Dependency installation remains frozen and the canonical CI remains explicitly uncached.
- Missing Testcontainers evidence remains a hard upload failure; it was not weakened to make early failures green.
- GitHub emitted an informational warning that the pinned upload-artifact action targets Node 20 and is being forced onto Node 24. The action executed successfully in all three attempts. This warning is not a false success or skipped gate; a future immutable action-runtime refresh may address it separately without reopening this evidence.

## Determination

The prior B1 finding is **RESOLVED**. AW-008F1 has actual public GitHub-hosted pull-request proof on the final corrected SHA, including real runner allocation, complete steps, exact test counts, Testcontainers execution, and retained evidence upload.

Verdict: **PASS**
