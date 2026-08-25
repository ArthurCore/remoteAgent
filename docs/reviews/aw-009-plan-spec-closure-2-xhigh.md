REQUEST_CHANGES

# AW-009 Final Focused Plan Specification Closure — xhigh

## Residual blocker

1. **Blocker 2 remains open: four AW-009 card paths are not exact repository-relative paths.**
   - `E4` lists bare `channel-sidebar.tsx` and `last-location.ts` instead of `apps/web/app/channel-sidebar.tsx` and `apps/web/app/last-location.ts`.
   - `E5` lists bare `channel-form.tsx` and `join-channel-button.tsx` instead of `apps/web/app/channel-form.tsx` and `apps/web/app/join-channel-button.tsx`.

   Because the mandatory protocol defines each literal exclusive-path list as the complete path lock and `git add` set, these basename-only entries require worker inference and do not satisfy the exact-repo-path requirement across all 27 serial AW-009 cards. Freeze the four full repository-relative paths in the card lists and their corresponding commit-set wording, then re-review.
