# AW-006 — Foundation Closure Approval (xhigh)

- **Reviewed revision:** `61b0833e65bd01cc3f39a40faf84c073440c144e`
- **Review scope:** only the three minimal corrections identified in `foundation-final-approval-xhigh.md:35-39`.
- **Verdict:** **APPROVED**

## Closure findings

### 1. Exact AW-007 scaffold tree — **RESOLVED**

The prior requirement was to include every required config, assertion script, invalid fixture, and `storage-init` implementation path (`foundation-final-approval-xhigh.md:37`). The tree is now explicitly exact and includes `.dependency-cruiser.cjs` (`aw-007-scaffold-manifest.md:61-69`), the forbidden boundary fixture plus `storage-init` source/test (`aw-007-scaffold-manifest.md:111-124`), and both assertion scripts (`aw-007-scaffold-manifest.md:150-155`). The source, test, and built `storage-init` paths are also frozen explicitly (`aw-007-scaffold-manifest.md:159`).

### 2. Root-script ownership and RustFS pin — **RESOLVED**

The prior requirement was to assign every canonical root script to its first owning card and use the verified immutable RustFS pin (`foundation-final-approval-xhigh.md:38`). The canonical root namespace is enumerated in `aw-007-scaffold-manifest.md:192-213`; the ownership table assigns every one of those scripts to AW-007 (`aw-007-scaffold-manifest.md:234-244`). The Compose contract now uses exactly the immutable pin previously required at `foundation-final-approval-xhigh.md:28`: `rustfs/rustfs:1.0.0-rc.3@sha256:800cf3f352a0a27e3275ca854a51f0027975d7acc7a0d52089a35bcc9fcbf0b5` (`aw-007-scaffold-manifest.md:292-298`).

### 3. First-release backup bootstrap — **RESOLVED**

The prior requirement was one identical contract for restore count, ID/date selection, fixture depth, and activation/expiry (`foundation-final-approval-xhigh.md:39`). The release authority requires exactly two isolated restores from distinct IDs and UTC dates, newest plus independently selected older, with at least one full 1,000,000-message/10-GiB drill (`release-profile-registry.md:315-323`). The UX registry declares that authority sole and repeats the same two-restore, ID/date, newest/older, and full-fixture rules (`chat-ux-gate-registry.md:305-322`). Both activate the rolling 30/30 rule at 30 scheduled jobs without reset and apply the same 30-day restore-evidence expiry and pre-30 newest-backup rule (`release-profile-registry.md:321-328`; `chat-ux-gate-registry.md:323-329`).

## Dispatch decision

All three minimal corrections are resolved. **AW-006 is complete and AW-007 may start.**
