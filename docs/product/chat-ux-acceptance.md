# Commercial-quality Web Chat UX Acceptance Specification

> **Gate authority:** Countable gate membership, tier, evidence mode, and owner are defined only by `docs/product/chat-ux-gate-registry.md`. This specification contains 179 uniquely identified criteria. Unnumbered principles and journey prose explain those IDs but do not create additional release rows.

- **Work item:** AW-002
- **Status:** Milestone 1 implementation contract
- **Primary surface:** responsive web
- **Priority order:** polished human chat → easy personal-Agent attachment → native mobile

## 1. Purpose and scope

This document defines the user journeys and observable acceptance criteria for a human-first, commercial-quality Chat Core. It is a product/UX contract for design, implementation, QA, and release review; it does not prescribe the internal architecture.

A Milestone 1 release is acceptable only when a team can use the product every day without any Agent feature. Agent attachment begins only after the Chat Foundation exit gate passes.

### 1.1 Scope labels

| Label | Meaning |
|---|---|
| **MVP — release blocking** | Required for Milestone 1. Missing or materially broken behavior blocks release. |
| **Deferred** | Explicitly excluded from Milestone 1. It must not appear as a working promise or a dead-end control. |

Every identified criterion is classified by the gate registry as `NON_WAIVABLE`, `RELEASE_BLOCKING`, or `TRACKED_POLISH`. Unnumbered prose is explanatory. `TRACKED_POLISH` gaps do not fail M1 but require an owned tracking issue; deferred capability IDs do not promote those capabilities into M1.

### 1.2 MVP product model

- One organization/tenant can contain one or more workspaces, subject to deployment policy.
- A person is a workspace **owner**, **admin**, **member**, or **deactivated member**.
- A workspace contains public channels, private channels, and one-to-one DMs.
- A message may have a one-level thread, reactions, edits, a soft-delete tombstone, mentions, and attachments.
- PostgreSQL-backed server state is authoritative. UI optimism must always converge to the durable server result.
- Presence and typing are ephemeral hints, not an audit record or proof that a message was read.

### 1.3 Product principles

1. **Never fake delivery.** A message is shown as sent only after durable server acceptance. Pending, failed, and sent states are visually and semantically distinct.
2. **Keep the user oriented.** Opening, paging, reconnecting, editing, or receiving new messages must not cause unexplained scroll jumps or loss of context.
3. **Make privacy boundaries visible.** Public/private status, membership, notification scope, and destructive action impact are clear before action.
4. **Prefer recovery over dead ends.** Every recoverable failure offers a useful retry or alternate next step without losing user-authored content.
5. **No hover-only functionality.** All message and navigation actions work with keyboard, touch, and assistive technology.
6. **Responsive, not merely shrunken.** Mobile web retains complete core chat workflows while simplifying pane layout.
7. **Counts are trustworthy.** Unread, mention, and thread indicators converge across tabs/devices and survive sign-out/sign-in.

## 2. Release-level outcomes

| Outcome | MVP acceptance measure |
|---|---|
| First value | An invited new user reaches the target workspace and sends a first message in **3 minutes or less** in a moderated usability test, excluding time spent retrieving the invite email. |
| Core journey completeness | Channel create/join, invite, DM, send, thread, reaction, edit/delete, unread recovery, file, search, and notification settings pass end-to-end tests. |
| Delivery clarity | In tests involving latency, disconnect, and retry, users can distinguish pending, failed, and accepted messages; duplicate visible messages are never produced. |
| Reconnect continuity | A client reconnects and catches up without missing or reversing messages; the viewport and unsent draft remain understandable. |
| Accessibility | Core journeys are operable by keyboard and a supported screen reader and meet WCAG 2.2 AA criteria listed in §19. |
| Responsive usability | The complete core journey works at 320 CSS px width through wide desktop without horizontal page scrolling. |
| Authorization fidelity | Users never see search results, files, messages, channel metadata, notifications, or presence from a workspace/channel they cannot access. |

## 3. Primary end-to-end journeys

### J1 — Workspace owner starts a team

1. The owner authenticates through the deployment's configured sign-in method.
2. The owner creates or enters a workspace, sets a recognizable name, and lands in a default general channel.
3. The owner invites colleagues by email, can see pending invitations, and can revoke an invitation.
4. The owner creates a public or private channel and posts the first message.
5. A clear next action introduces inviting members or starting a DM without forcing a product tour.

**Journey acceptance**

- The flow has one primary action per step, preserves entered values after validation errors, and never requires knowledge of internal tenant/workspace concepts.
- On completion, the owner sees the normal chat shell rather than an onboarding-only dead end.
- Skipping optional profile or tour steps does not block chatting.
- Workspace creation, if disabled by deployment policy, is absent rather than failing after submission.

### J2 — Invited member reaches first value

1. The member follows a single-use, expiring invitation link.
2. The page identifies the inviting workspace and inviter before the member joins.
3. The member signs in or creates an identity using an allowed method.
4. The member confirms a display name and accepts workspace terms/policy if configured.
5. The member lands in the intended workspace/channel with enough history to understand context and sends a message.

**Journey acceptance**

- Existing signed-in users do not create an accidental second account.
- Expired, revoked, reused, malformed, and wrong-workspace invitations each produce a safe, specific recovery screen; none silently join the user.
- If the signed-in account does not match a restricted invite, the UI explains the mismatch without exposing membership or private workspace data and offers account switching/sign-out.
- Refreshing after successful acceptance opens the workspace; it does not attempt to consume the invite again.

### J3 — Member catches up and participates

1. The member opens a workspace and can identify channels/DMs with unread messages and mentions.
2. Opening a channel positions the member at the first unread message when practical, with an unread separator and a way to jump to latest.
3. The member reads history, opens a thread, reacts, writes a reply, and returns to the same timeline position.
4. New messages arriving while the member reads older history do not pull the viewport away; a new-message affordance appears.
5. Read state synchronizes after reconnect and on another device/tab.

### J4 — Member shares and retrieves a file

1. The member attaches via picker, drag-and-drop, or paste where supported.
2. The composer shows file name, type, size, progress, and remove/cancel before send.
3. The file is uploaded through quarantine/validation/scanning and is not downloadable until authorized and cleared.
4. Recipients see an understandable processing, available, blocked, or failed state.
5. An authorized recipient previews supported safe formats or downloads the file with its original name.

### J5 — Member finds prior context

1. The member opens search from anywhere using mouse or keyboard.
2. The member enters a term and narrows by channel, person, or date where available in MVP.
3. Results show enough snippet/context to disambiguate, with channel/DM, author, and timestamp.
4. Selecting a result opens the exact message in context and provides a route back to results without losing the query.
5. Results change immediately when the member loses channel access and never disclose unauthorized content.

### J6 — Member continues through a network interruption

1. Connection quality degrades or disconnects.
2. The shell remains usable for already loaded content and shows a non-modal offline/reconnecting status.
3. Draft text and attachment selections are not silently discarded.
4. A newly submitted text message appears as pending, then automatically retries with the same idempotency identity after reconnect, unless the user cancels it.
5. After delta catch-up, events, counts, and timeline order converge; the UI announces reconnection without stealing focus.

### J7 — Admin handles a routine incident

1. An admin opens workspace administration from a clearly separated surface.
2. The admin reviews member status and recent auditable actions.
3. The admin deactivates a member after reading the impact and confirming the action.
4. The deactivated member's sessions are invalidated; historical messages remain attributable.
5. The admin can later reactivate the member and can export the audit view in the supported MVP format.

## 4. Onboarding and invitations

- **ONB-01:** A new workspace has a useful default channel and a visible empty-state action to write a message or invite people; it does not show a blank canvas.
- **ONB-02:** Required fields, workspace naming rules, and sign-in prerequisites are explained before submission. Inline errors are associated with fields and focus moves to the first invalid field on submit.
- **ONB-03:** Optional onboarding can be dismissed and resumed; core chat is never gated behind a tour.
- **ONB-04:** Invitation creation explicitly shows recipient, workspace, optional target channels, expiration, and who is sending it before confirmation.
- **ONB-05:** Invite links are single-use and expiring. The inviter can see pending/accepted/expired/revoked status and resend by issuing a new invitation.
- **ONB-06:** Accepting an invite grants only the intended workspace membership and public/default-channel access plus any explicitly included private channels.
- **ONB-07:** A user accepting an invite while already a member lands in the workspace with a neutral “You already belong to this workspace” result; no duplicate membership is created.
- **ONB-08:** Invite acceptance is idempotent across refresh/back navigation and gives no cross-tenant information on invalid links.
- **ONB-09:** The invite page and first-run shell meet the same accessibility/responsive requirements as the main app.
- **ONB-10:** A workspace owner can copy a newly generated invite link only when link invitations are allowed by policy; otherwise the unavailable option is absent and email invitation remains clear.

## 5. Workspace, channel, and DM navigation

- **NAV-01:** The shell persistently identifies the active workspace and active channel/DM; identical channel names in different workspaces cannot be confused.
- **NAV-02:** Workspace switching preserves a sensible last location per workspace and never carries message content, search results, drafts, or member lists across tenant boundaries.
- **NAV-03:** Public and private channels use distinct labels/icons with accessible names. A private channel's existence is not revealed to non-members.
- **NAV-04:** A permitted member can create a channel with name, purpose/description, and public/private visibility. Name conflicts and naming rules are checked inline without losing data.
- **NAV-05:** Public channels are discoverable and joinable according to workspace policy. Private channels are visible only by membership or an authorized invitation.
- **NAV-06:** Leaving a channel explains effects on access, unread state, and private-channel rediscovery before confirmation.
- **NAV-07:** Archived channels are read-only, clearly labeled, excluded from the default active list, searchable only by authorized members, and restorable by an authorized admin.
- **NAV-08:** Starting a one-to-one DM by selecting a member reuses the existing DM with that same pair in the workspace; duplicate DM conversations are not created.
- **NAV-09:** The DM header identifies the other participant and their current coarse presence. A deactivated participant is labeled; history remains readable but new sending is disabled.
- **NAV-10:** Sidebar ordering is predictable: channels and DMs are grouped, unread items remain easy to find, and user-controlled section collapse does not hide aggregate unread/mention indication.
- **NAV-11:** URLs/deep links use stable identifiers. Authorized users opening a message/channel link reach the target; unauthorized, deleted, or unavailable targets show a safe explanation and route back.
- **NAV-12:** Channel members can view the current member list; non-members cannot infer private-channel membership.

## 6. Message timeline and history

- **TIM-01:** Messages render in authoritative channel sequence order with author, timestamp, content, edit/delete state, reactions, attachment state, and thread summary as applicable.
- **TIM-02:** Consecutive messages may be visually grouped, but every message retains an accessible author and timestamp. Date separators use the viewer's locale/time zone and expose full absolute time.
- **TIM-03:** History loads with cursor pagination. Loading older pages does not duplicate, omit, reorder, or visually jump already rendered messages.
- **TIM-04:** The scroll anchor is preserved when older history, image dimensions, edits, reactions, or thread counts change above the viewport.
- **TIM-05:** When the user is at/near latest, new messages remain visible without disruptive animation. When reading older content, the viewport stays fixed and a count-bearing “new messages” control jumps to latest.
- **TIM-06:** An unread separator appears before the first unread message when that message remains in retained/accessible history. If not available, the UI explains that earlier unread history is unavailable and offers latest available context.
- **TIM-07:** “Jump to first unread,” “jump to latest,” and “return to previous position” are keyboard accessible and restore focus meaningfully.
- **TIM-08:** Message permalinks open the message highlighted temporarily in surrounding context, not as an isolated content leak.
- **TIM-09:** Server-adjusted timestamps or local clock skew never determine message order. Relative labels such as “just now” have an absolute-time accessible label.
- **TIM-10:** Link rendering prevents unsafe schemes; external links are visually identifiable and do not expose authentication/session data.
- **TIM-11:** Deleted messages render a stable tombstone where needed for order/thread context rather than collapsing the conversation unexpectedly.
- **TIM-12:** A message that has not received durable acceptance is labeled pending. Failure changes it to failed with retry and remove actions; it is never silently discarded or represented as delivered.

## 7. Composer and sending

- **CMP-01:** The composer identifies the destination (“Message #channel” or person) and thread context. Users cannot accidentally send a thread reply to the channel timeline.
- **CMP-02:** Enter sends and Shift+Enter inserts a line break on desktop by default. The behavior is discoverable and can be made accessible for input methods; composing text with an IME never sends on composition confirmation.
- **CMP-03:** The send button has an accessible name and disabled reason. Whitespace-only messages cannot be sent.
- **CMP-04:** Plain text, line breaks, safe links, inline code, code blocks, and a bounded basic emphasis syntax render consistently. A preview is not required.
- **CMP-05:** `@` opens an accessible member suggestion list scoped to the conversation. Keyboard selection, dismissal, and duplicate display names are handled without ambiguity.
- **CMP-06:** The UI warns before using a high-impact workspace/channel-wide mention if such mention is permitted. Unauthorized mention tokens remain plain text.
- **CMP-07:** Text and unsent attachment metadata are preserved per conversation across navigation, accidental refresh, temporary disconnect, and recoverable session refresh, within documented local-storage/privacy limits.
- **CMP-08:** Drafts are not synchronized across devices in MVP, and the UI does not imply that they are.
- **CMP-09:** Double-submit, retry, reconnect, and multi-click use the same client idempotency identity and create one durable visible message.
- **CMP-10:** After acceptance, the composer clears only content included in that accepted command. Text typed while an earlier send is pending is not erased.
- **CMP-11:** Paste/drag of text or files gives a visible result; unsupported/oversized content is rejected before send where detectable, with the limit and recovery action.
- **CMP-12:** Rate limit, permission loss, channel archive, and session expiry errors preserve authored content and state what must happen before retry.

## 8. Threads

- **THR-01:** Threads are one level deep. Replies cannot create nested threads.
- **THR-02:** Opening a thread shows the parent, ordered replies, reply count, participants, unread state, and composer in a side panel on wide screens and a full-screen route/sheet on narrow screens.
- **THR-03:** Opening and closing a thread preserves the channel timeline's scroll position and returns focus to the invoking message/action.
- **THR-04:** The parent displays reply count and latest-reply summary. Counts converge after reconnect, edits, deletions, and concurrent replies.
- **THR-05:** A reply lives in the thread and does not appear as a duplicate top-level timeline message. The parent summary makes thread activity discoverable.
- **THR-06:** Mentions in a thread trigger the recipient's mention/unread indicators and deep-link to the exact reply.
- **THR-07:** Deleting the parent leaves a tombstone and keeps its authorized thread accessible. Deleting every reply does not fabricate a nonzero reply count.
- **THR-08:** Thread read state is distinct enough to show unread thread activity and converges across devices after the thread is viewed.
- **THR-09:** Loading older replies and receiving live replies preserve ordering and the reader's position under the same rules as the main timeline.

## 9. Reactions

- **RCT-01:** A user can add/remove an emoji reaction from keyboard, touch, or pointer. Repeating the same reaction command is idempotent.
- **RCT-02:** Reaction chips show emoji, count, whether the current user reacted, and an accessible list or dialog of reactors.
- **RCT-03:** Concurrent reaction updates converge without negative counts, duplicate user entries, or persistent optimistic ghosts.
- **RCT-04:** A failed optimistic reaction returns to server state and announces the failure non-modally.
- **RCT-05:** Users cannot react to a deleted message or a conversation they can no longer access.
- **RCT-06:** MVP provides a curated, searchable emoji picker and recent choices stored per user/device as appropriate; custom workspace emoji is deferred.

## 10. Edit and delete

- **EDT-01:** A member can edit their own non-deleted message. Admin editing another person's content is not available.
- **EDT-02:** Edit mode retains original content, has explicit Save/Cancel actions, supports keyboard operation, and does not submit on IME composition.
- **EDT-03:** Successful edits display an “edited” indicator with an accessible timestamp. Prior versions remain available for audit/administrative needs but are not exposed as a general member-facing version browser in MVP.
- **EDT-04:** If edit authorization, version, retention, or connectivity changed, the UI retains the proposed edit and offers copy/retry after refreshing authoritative state.
- **EDT-05:** Delete requires confirmation that distinguishes deleting a message from deleting an attachment or thread reply. The default action is non-destructive cancel.
- **EDT-06:** Deletion produces a tombstone, removes content and attachment access from normal member UI, updates search/index results, and converges across devices.
- **EDT-07:** Delete behavior for a parent with replies is explained before confirmation; the thread remains under a deleted-parent tombstone.
- **EDT-08:** Edit/delete actions are absent or disabled with a reason when the user lacks permission or a policy window has closed.
- **EDT-09:** Permanent purge and legal-hold behavior follow retention policy and are admin/system concerns; ordinary users are not promised immediate physical erasure by the soft-delete action.

## 11. Unread, read state, and mentions

- **URD-01:** Channel/DM unread counts derive from a monotonic per-user read cursor and cannot roll backward because of an older tab/device.
- **URD-02:** A conversation is not marked read merely by appearing in a collapsed/hidden pane. It advances when the relevant timeline is visible and the user reaches/observes the latest applicable content under a documented rule.
- **URD-03:** Users can explicitly mark a conversation unread from a selected message; this is a personal attention marker and must not corrupt the server's durable delivery/order semantics.
- **URD-04:** Sidebar badges distinguish ordinary unread activity from direct mentions. Aggregate counts remain visible when sections are collapsed.
- **URD-05:** The mention inbox lists direct mentions and permitted group mentions, including thread replies, with read status and a deep link to context.
- **URD-06:** Opening a mention from the inbox marks it read only when the target context is successfully shown; inaccessible/deleted targets resolve safely and update stale indicators.
- **URD-07:** Self-authored messages do not create unread/mention counts for the author, including from another active tab, after convergence.
- **URD-08:** Muted conversations follow their configured badge/notification behavior without hiding direct mentions unless the user explicitly selected that policy.
- **URD-09:** Unread, direct-mention, and unread-thread counts remain identical after sign-out/sign-in, reconnect, and a second-device refresh once synchronization completes.
- **URD-10:** A “mark all read” action states its workspace scope, requires confirmation when impact is broad, and converges without suppressing messages that arrive after the command's server boundary.

## 12. Files and attachments

- **FIL-01:** The UI publishes configured allowed types and maximum size at selection/error time; it does not rely only on filename extension.
- **FIL-02:** Upload shows per-file progress, cancel, retry, and failure reason. Removing a selected file before send does not delete an unrelated existing file.
- **FIL-03:** Files enter a quarantine/processing state. Until server validation and scanning pass, recipients cannot download raw content via guessed or copied object URLs.
- **FIL-04:** Processing, available, blocked, expired/removed, and failed states have distinct text—not color alone—and update live.
- **FIL-05:** Authorized download is rechecked on every request. Losing channel/workspace access invalidates subsequent download, preview, and search access.
- **FIL-06:** Images and other explicitly supported safe formats may have bounded previews with alt text/file-name fallback. Unsupported formats show metadata and download only.
- **FIL-07:** Attachment cards expose original filename, formatted size, type when known, uploader, and upload time. Long or bidi filenames cannot break layout or spoof adjacent UI.
- **FIL-08:** Resumable upload contracts are mobile-compatible. In MVP web, interruption either resumes safely or clearly restarts without creating duplicate message/attachment records.
- **FIL-09:** Deleting a message removes ordinary access to its attachments and search entries according to retention policy.
- **FIL-10:** Drag-and-drop has a visible target and keyboard-equivalent file picker. Pasting an image/file never sends automatically without user confirmation.
- **FIL-11:** Malware/scan failure does not expose the file and gives the uploader a safe generic explanation without dangerous content details.

## 13. Search

- **SRC-01:** Search is available globally from the shell and by a documented keyboard shortcut; focus is placed in the query field and Escape closes/restores focus.
- **SRC-02:** MVP searches authorized message text and filenames across the current workspace, with filters for conversation, author, and date range.
- **SRC-03:** Results show highlighted snippets, author, conversation, timestamp, attachment indicator, and thread context where relevant.
- **SRC-04:** Results are stably paginated and explain no-result versus error versus still-loading states.
- **SRC-05:** Selecting a result opens the exact message/reply in surrounding context. Back returns to the same query, filters, result position, and scroll state.
- **SRC-06:** Authorization is re-evaluated at query and result-open time. Private channels/DMs, deleted content, and inaccessible attachments never leak through counts, snippets, suggestions, or stale caches.
- **SRC-07:** Edits become searchable and deleted content disappears within a documented indexing target; until then, result-open authorization/state prevents disclosure.
- **SRC-08:** Search terms are safely encoded and cannot execute markup. Keyboard and screen-reader users can navigate result groups and hear the result count.
- **SRC-09:** Empty query shows useful recent/scope guidance, not fabricated results. Minimum query/limit errors are explained before network submission where possible.

## 14. Notifications and preferences

- **NTF-01:** MVP includes in-app unread/mention indicators and optional web/browser notifications when technically supported and explicitly permitted by the user.
- **NTF-02:** Notification permission is requested contextually after the benefit is explained, never automatically on first page load. Denial does not block chat and includes browser-settings recovery guidance when the user later opts in.
- **NTF-03:** Users can set workspace defaults and per-channel/DM overrides for all activity, mentions only, or mute, plus quiet hours with displayed time zone.
- **NTF-04:** The effective setting is visible at the conversation level, including inherited versus overridden state and an action to reset to default.
- **NTF-05:** Foreground viewing, self-authored events, muted scope, and quiet hours suppress notifications according to policy without corrupting unread/mention counts.
- **NTF-06:** Notification title/body reveal no private message content when the user selected privacy-safe previews or the session is no longer authorized.
- **NTF-07:** Activating a notification deep-links to the exact authorized workspace/message and then fetches authoritative state; stale or inaccessible targets fail safely.
- **NTF-08:** Duplicate outbox delivery or reconnect does not create duplicate visible notifications for the same event.
- **NTF-09:** Email and native mobile push schemas/outbox readiness may be implemented, but production email delivery and native push UX are **Deferred** unless separately promoted by an approved release scope.

## 15. Presence and typing

- **PRS-01:** MVP exposes coarse presence: online, away, and offline/unknown. It does not expose precise last activity by default.
- **PRS-02:** Presence is explicitly a best-effort hint. Disconnect, sleep, and TTL expiry move stale users away/offline within the documented interval.
- **PRS-03:** A user's own status converges across multiple tabs/devices without rapid flicker when one tab closes.
- **PRS-04:** Typing indicators are ephemeral, scoped to the current channel/DM/thread, rate-limited, and removed on send, blur/stop timeout, disconnect, or permission loss.
- **PRS-05:** Typing text handles one, two, and many typers without continuously shifting layout. Assistive announcements are throttled to avoid noise.
- **PRS-06:** Presence/typing from private conversations is delivered only to authorized current members and is never included in audit/search history.
- **PRS-07:** Users can disable broadcasting typing/presence if required by workspace privacy policy; unknown is not misleadingly rendered as offline certainty.

## 16. Administration and audit

- **ADM-01:** Owner/admin capabilities are separated from member UI and protected by server authorization; hiding a control is not the security boundary.
- **ADM-02:** Admin can list active, invited, and deactivated members; inspect role/status; invite/revoke invite; change permitted roles; deactivate; and reactivate.
- **ADM-03:** Role changes and self-demotion explain impact. The last owner cannot be removed/demoted without transferring ownership.
- **ADM-04:** Deactivation confirmation states that active sessions will be revoked, new access blocked, and historical authorship retained. Deactivation takes effect across HTTP, realtime, files, and search.
- **ADM-05:** Admin can archive/restore channels. Private-channel visibility remains membership-bound even for admin unless explicit policy grants access; administrative metadata must not imply unrestricted content access.
- **ADM-06:** Admin can view the effective workspace retention setting and change it only with a clear impact warning and authorization. The product does not claim retroactive purge until processing completes.
- **ADM-07:** Audit view includes actor, action, target, outcome, and absolute timestamp for invite, membership/role, deactivation/reactivation, channel archive/restore, retention, and relevant moderation actions.
- **ADM-08:** Audit entries are immutable to normal admins, paginated, filterable, and exportable in the MVP-supported machine-readable format. Export generation has progress, failure, expiry, and authorized-download states.
- **ADM-09:** Administrative errors never leave the UI claiming success before authoritative confirmation. Re-authentication or changed permissions preserve safe context but not secret values.
- **ADM-10:** Workspace-wide data export beyond the scoped audit export is **Deferred** unless required by an approved compliance release.

## 17. Empty, loading, error, and permission states

Every major surface—workspace list, channel/DM list, timeline, thread, member list, mentions, files, search, notifications, and admin—must implement the following applicable state contract.

### 17.1 Empty

- **STA-E01:** Empty state says what is empty, why when known, and offers the highest-value permitted next action.
- **STA-E02:** A new channel distinguishes “No messages yet” from “No results,” “History unavailable,” and “You do not have access.”
- **STA-E03:** Empty states do not advertise actions the current role/policy cannot perform.

### 17.2 Loading

- **STA-L01:** Initial shell loading uses a stable layout/skeleton; it does not flash another tenant's cached content or a false zero-count state.
- **STA-L02:** Incremental timeline/search pagination shows local progress without blocking already loaded content.
- **STA-L03:** After approximately one second, long operations expose text status; operations exceeding their expected range offer cancel/retry or explanatory guidance where safe.
- **STA-L04:** Busy controls prevent accidental duplicate commands while retaining an accessible busy state (`aria-busy`/status equivalent).

### 17.3 Recoverable error

- **STA-R01:** Errors identify the affected action, preserve safe user input, and provide Retry when retry is safe. They do not expose stack traces, object keys, tokens, or tenant identifiers.
- **STA-R02:** A page-level failure retains global navigation when authorized and provides a route to a safe workspace location.
- **STA-R03:** Inline errors are close to their source; non-modal toasts/status messages do not become the sole durable record of a failed send/upload/admin action.
- **STA-R04:** Retrying a command preserves idempotency and cannot duplicate messages, reactions, invites, uploads, or admin actions.

### 17.4 Not found or no permission

- **STA-P01:** Unauthorized and nonexistent private resources use a non-disclosing response while still giving a signed-in user a safe route back.
- **STA-P02:** When access is revoked while open, private content is removed from the active UI/cache as soon as practical, subscriptions stop, and the user sees a neutral access-changed state.
- **STA-P03:** An archived channel, deactivated account, expired session, and deleted message each use specific recovery copy where disclosure is safe; they are not collapsed into a generic crash.

## 18. Offline, reconnect, and multi-device convergence

- **NET-01:** Connection states are `connected`, `reconnecting`, and `offline`; the indicator is visible but non-blocking and announced only on meaningful transitions.
- **NET-02:** Already loaded authorized history remains readable offline. Actions requiring a server are either queued under the rules below or disabled with a reason; the UI never fabricates successful state.
- **NET-03:** Draft text persists locally. Submitted text commands may queue with a stable idempotency key and visible pending state. The user can cancel a queued item before transmission.
- **NET-04:** On reconnect, the client resumes from its last contiguous server cursor, fetches missing durable events, applies them in sequence, then sends eligible queued commands.
- **NET-05:** Automatic retry uses bounded backoff and the same idempotency key. A terminal validation/authorization failure becomes a visible failed item with edit/copy/remove actions, not an infinite spinner.
- **NET-06:** Attachment uploads expose whether they will resume or restart. A missing local file after refresh becomes actionable failure; the message is not accepted as if the attachment existed.
- **NET-07:** Reconnect does not move a reader from older history to latest. New events update the new-message affordance while preserving the scroll anchor.
- **NET-08:** Edits, deletes, reactions, threads, membership, read counts, and notification settings converge to server state across tabs/devices. An optimistic conflict visibly resolves without duplicating content.
- **NET-09:** During session expiry, the user can re-authenticate and return to the same safe destination with drafts retained; private content is not left exposed after an unrecoverable sign-out.
- **NET-10:** After a gateway restart or network flap, no accepted message is lost, no channel sequence is reversed, and no unread/mention/thread count remains stale after catch-up.
- **NET-11:** Slow-client/backpressure recovery may disconnect and resume the client, but must explain temporary reconnection and recover from the durable cursor rather than silently dropping events.

## 19. Accessibility

The MVP target is **WCAG 2.2 AA** for all core journeys, verified by automated checks plus manual keyboard and screen-reader review.

- **A11Y-01:** Every action is keyboard operable in a logical order. Focus is visible and never trapped except in a correctly implemented modal; Escape behavior is consistent.
- **A11Y-02:** Skip/navigation landmarks allow users to move among workspace switcher, sidebar, conversation header, timeline, composer, thread, and utility panels.
- **A11Y-03:** Virtualized timelines preserve semantic reading order and expose message author, full timestamp, content, edited/deleted state, reactions, and thread summary without relying on visual grouping.
- **A11Y-04:** New messages do not cause the screen reader to reread the timeline. Polite live regions announce relevant send status, connection transitions, and direct feedback without flooding.
- **A11Y-05:** Menus, dialogs, emoji/mention pickers, comboboxes, tabs, and tooltips follow appropriate ARIA patterns, have names, restore focus, and work at 200% zoom.
- **A11Y-06:** Color is never the only indicator for unread, mention, presence, error, upload, privacy, or selected state. Text and interactive contrast meet AA.
- **A11Y-07:** Motion respects `prefers-reduced-motion`; there are no essential flashing animations. Loading and optimistic transitions remain understandable without motion.
- **A11Y-08:** Text can resize to 200% and content reflow at 400% zoom without loss of information or two-dimensional page scrolling, except intrinsically two-dimensional content.
- **A11Y-09:** Pointer targets are at least 24×24 CSS px under WCAG 2.2 AA, with a product target of 44×44 CSS px for primary touch actions on narrow screens.
- **A11Y-10:** Errors are programmatically associated, summarized on submit when needed, and do not disappear before assistive users can understand them.
- **A11Y-11:** Keyboard-only and screen-reader users can complete invite acceptance, channel/DM navigation, send, thread, reaction, edit/delete, file attach, search, unread recovery, notification settings, and admin deactivation.
- **A11Y-12:** Supported test baseline includes current Chrome/Edge/Firefox/Safari keyboard operation and at least VoiceOver+Safari plus one additional screen reader/browser pairing selected by QA.

## 20. Responsive web behavior

- **RWD-01:** Supported range begins at 320 CSS px. No core page produces horizontal document scrolling; message code/attachments may scroll within bounded containers.
- **RWD-02:** Wide desktop may show channel sidebar + timeline + thread/member panel. Tablet collapses one secondary pane. Narrow mobile web shows one primary surface at a time with explicit back navigation and preserved state.
- **RWD-03:** Opening a thread, search, channel list, member list, or settings on narrow screens does not discard the timeline scroll position or composer draft.
- **RWD-04:** Composer remains reachable above the on-screen keyboard and safe areas. Orientation change and viewport resize do not hide send/attachment controls or erase text.
- **RWD-05:** Hover affordances have persistent/focus/touch alternatives. Message action menus are reachable without pixel-precise targeting.
- **RWD-06:** Headers truncate safely while retaining full accessible names. Long messages, URLs, code, filenames, translations, and 200% text do not overlap controls.
- **RWD-07:** Mobile web supports all MVP member journeys, including channel/DM, thread, reaction, edit/delete, unread/mentions, file selection, search, preferences, and reconnect.
- **RWD-08:** Admin tables/forms are usable on narrow web through reflow/cards or bounded region scrolling, without requiring desktop mode for routine member/channel administration.
- **RWD-09:** Native iOS/Android applications, native push, and offline native caches are **Deferred**. The API/deep-link/upload/sync contracts must remain mobile-compatible from Milestone 1.

## 21. Commercial polish and trust criteria

- **POL-01:** Destructive actions use precise nouns and consequences (“Delete message,” “Deactivate member”), not generic “Are you sure?”.
- **POL-02:** Relative times, counts, pluralization, number/date formatting, and text expansion are localization-ready; MVP may ship one locale but must not concatenate inaccessible fragments.
- **POL-03:** Success feedback is proportional: ordinary send/reaction actions do not create noisy toasts; exceptional or asynchronous actions have durable status.
- **POL-04:** Browser refresh, back/forward, copied links, and opening in a new tab preserve valid navigation semantics.
- **POL-05:** Sensitive content is excluded from URLs, page titles when privacy mode requires it, telemetry payloads, and client error logs.
- **POL-06:** Session/account/workspace identity is always clear before an invite acceptance, admin action, or cross-workspace navigation.
- **POL-07:** No unfinished MVP control is shipped as “coming soon” in the primary chat experience; deferred capabilities are omitted unless a non-interactive explanation is necessary.

## 22. Explicitly deferred scope

The following are **not Milestone 1 acceptance requirements** and must not delay the human-chat release unless separately promoted through an approved product change:

### Agent and orchestration

- Personal-Agent creation, pairing, connector, mention routing, streaming, cancel, or Agent presence (**Milestone 2**).
- Agent-to-Agent free discussion, autonomous fan-out, task decomposition, risky tool execution, deployment approval, and multi-Agent coordination.
- Shared Mind, Fact/Decision/Evidence knowledge store, product Kanban, product Orchestrator, and long-term Agent memory.

### Chat/product expansion

- Group DMs; multi-workspace shared channels; guest/external/federated users.
- Voice/video calls, screen sharing, huddles, live audio rooms.
- End-to-end encryption and federation.
- Rich collaborative documents/canvas, whiteboards, polls, forms, workflows, bots, slash-command platform, and plugin marketplace.
- Custom workspace emoji/stickers, animated effects, scheduled send, disappearing messages, message translation, and AI summary/composition.
- Member-facing full edit-version history, legal hold/eDiscovery suite, and full workspace data export beyond MVP audit export.
- Native iOS/Android apps, native push notifications, and native offline cache (**Milestone 3**).
- Production email notification delivery unless separately scoped; MVP retains notification preference and outbox-ready contracts.

Deferred items should start from a separate PRD after real Chat Core usage validates demand. Their absence is not a defect; a dead-end or misleading control for them is.

## 23. Milestone 1 UX exit gate

Milestone 1 passes only when all of the following are evidenced in the release candidate:

1. Every MVP criterion above is implemented or has an explicitly approved exception with owner, rationale, user impact, and expiry.
2. Automated end-to-end tests cover invite, channel, DM, message send/durable acceptance, thread, reaction, edit/delete, unread/mention, file, search, notification preference, admin deactivation, and reconnect.
3. Manual exploratory review covers empty/loading/error/permission/offline states, not only happy paths.
4. Keyboard-only and screen-reader runs complete all core member journeys; responsive runs cover 320 px narrow web, tablet, and wide desktop.
5. Multi-tab/device and reconnect tests show converged timeline, edit/delete/reaction/thread state and identical unread/mention/thread counts after synchronization.
6. The invited-user first-message journey meets the three-minute target.
7. No accepted message is presented as failed or lost, no failed/pending message is presented as accepted, and retries produce no duplicate visible message.
8. Shared Mind, product Kanban, Orchestrator, and Agent runtime remain outside the Chat Foundation implementation.
