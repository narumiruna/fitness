# Training UI/UX review and design plan

## Scope

Review date: 2026-10-28. Baseline: `cca619b`.

Review the shared navigation and the journey from workout history to live training
and recorded results. Preserve the existing routes, Radix controls, training rules,
and English/Traditional Chinese support. Do not repeat resolved findings from
[the previous remediation](web-ui-ux-remediation.md).

The rendered review covers populated Workouts, Calendar, Stats, and Exercises at
1440, 768, and 390 pixels. Training-entry and session-control findings also use
source inspection. These are expert findings, not participant-test results.

## Findings

| ID | Finding and evidence | Proposed change | Acceptance evidence |
| --- | --- | --- | --- |
| R1 | The mobile header uses about 228 pixels in the 390-pixel baseline capture. Brand, primary destinations, utilities, locale, account, and sign-out occupy separate rows. See `apps/web/src/app.tsx:290` and `apps/web/src/styles.css:1573`. | Use a compact mobile toolbar and clearly labeled primary navigation. Group utility/account actions in a Radix interaction. Keep all destinations and locale selection available. | Both locales and both roles at 320/390 pixels; keyboard opening/closing, focus return, active nested routes, and no horizontal overflow. Target a closed header no taller than 120 pixels. |
| R2 | Templates follow up to 20 history rows in mobile DOM order. Each template exposes date, rest duration, training, past logging, and deletion. See `pages/workouts.tsx:374` and `components/session-panel.tsx:22` under `apps/web/src/`. | Place a compact training entry before history. Show template identity first, then reveal setup for the selected template. Keep retrospective logging and scheduling separate. | Start from a template without traversing history. Keep date/rest input, explicit submission, validation, retained drafts, and duplicate-write protection. Do not turn opening a template into a mutation. |
| R3 | Continue links are inside filtered, paginated history. An older paused session can be absent from the current result set. See `apps/api/src/views.ts:90–170` and `apps/web/src/pages/workouts.tsx:270`. | Read ongoing sessions independently of history filters and pagination. Put Continue training in the training-entry section. | A paused session outside page 1 and outside active search criteria remains reachable. The view returns only the signed-in user's active/paused sessions. Opening Continue does not resume or create a session. |
| R4 | Active-session controls and the rest timer follow all set disclosures. Their distance from the current set grows with session length. See `apps/web/src/components/session-panel.tsx:124–271`. Current actuals and Complete set already have priority; retain this resolved behavior. | Put progress and rest status near the current set. Place Pause nearby; keep Finish and Abandon secondary. Do not add a fixed overlay over inputs. | A long-session fixture verifies order and proximity. Save and Enter do not complete a set. Zero load, dirty drafts, pause/resume, partial finish, abandonment, and conflict recovery retain their existing behavior. |
| R5 | Shared layout rules have several later overrides. Additional redesign overrides would make breakpoint behavior harder to verify. See `apps/web/src/styles.css:397`, `:819`, and `:1236`. | Consolidate only the shell and training rules that change. Use a small spacing/surface hierarchy and consistent action emphasis. Keep charts, tables, and destructive Radix colors intact. | Review affected selectors, computed destructive-button colors, responsive screenshots, and the existing accessibility/workflow suite. |

## Proposed direction

Keep the existing light surfaces, dark text, and teal action color. Make the next
training action more prominent than configuration. Keep history search and its
first result visible after the compact training entry. Do not place a large metric
banner before useful content.

- Desktop: compact shared navigation, a clear page heading, compact training entry,
  readable history, and secondary calendar/tools.
- Mobile: compact navigation, immediate training access, then search/history.
  Template setup appears only after a template is selected.
- Live session: visible state/progress and rest status near actual-value inputs;
  Complete set remains the main action.
- Empty history: provide a local next action. Do not fabricate progress, trends,
  durations, or suggested training data.

### Image-generation status

The user enabled `codex_imagegen` after the baseline review. It generated
`.cache/uiux-refresh/proposal.png` on 2026-10-28: a 1536 × 1024 board with desktop,
mobile dashboard, and mobile session views. The original was visually inspected.
No user settings were changed by the agent and no fallback provider was used.

Accepted: compact toolbar and four labeled mobile tabs, training entry before
history, teal task emphasis, secondary calendar, and session progress/rest near
actual-value inputs. Adjusted: leave template setup collapsed until selection so
the first history result remains visible. Rejected: invented navigation tabs,
stepper/reset controls, export controls, sample records, and exercise-level 1RM
claims that are not part of the existing workflow.

Only synthetic content was supplied. Original image bytes and screenshots remain
under ignored `.cache/uiux-refresh/`; no image is committed or used by the app.

Use this generation brief once the tool is available:

> Create a high-fidelity UI proposal board for Fitness, an existing strength
> training tracker. Include a 1440-pixel desktop workout dashboard, a 390-pixel
> mobile dashboard, and a 390-pixel active-session screen. Use a light neutral
> background, white surfaces, dark text, restrained teal actions, clear type,
> thin borders, and Radix-compatible controls. The mobile header must be compact.
> Put a small Continue training / Start from template area before searchable
> workout history. Keep Log a past workout distinct from live training. Show
> template setup only for the selected template. On the active screen, group
> progress, rest status, actual weight/reps, and Complete set. Keep Save secondary
> and Finish/Abandon clearly separate. Show realistic synthetic exercise names and
> kg units. Do not add fictional percentage gains, subscriptions, social features,
> a marketing hero, or decorative photography. Support longer Traditional Chinese
> labels through layout spacing. Favor readable content and accessible controls
> over decoration.

The generated image is a design reference, not proof of accessibility or usability.

## Implementation plan

1. Add an owner-scoped ongoing-session summary to the typed workouts view. Keep
   history filters, pagination, counts, and mutations unchanged.
2. Use a compact mobile toolbar with four labeled training destinations. Put
   utility/account navigation in a Radix dialog; retain locale selection,
   administrator restrictions, active routes, skip navigation, and focus return.
3. Put a compact training entry before history. Show the latest ongoing session
   and a disclosure for the others. Reveal date/rest setup for the chosen
   template. Keep each visited form mounted while inactive so a source change
   retains its draft and idempotency key, including after a lost response.
4. Put session progress, rest, and controls immediately before the current set.
   Keep actual-value entry and explicit Complete set behavior unchanged.
5. Consolidate affected CSS, add matching locale keys, and verify workflow,
   responsive, keyboard, real browser zoom, and accessibility behavior in both
   development and isolated production mode before opening the PR.

The changes remain within web presentation and the required read-model addition.
No dependency, Prisma schema, migration, authentication rule, calculation, or
production service changes are required.

## Review corrections

- Source switching originally remounted the selected template form. The final
  implementation keeps visited forms mounted but hides inactive forms. A browser
  regression commits a start, loses its response, switches templates and back,
  and retries with the same key; the session count increases only once.
- Older mobile sign-out tests now open More before choosing Sign out. They do
  not use a hidden desktop control or bypass the UI through an API.

## Rollback / Recovery

Revert the web changes, API read-model addition, and HTTP schema together. No
schema or data rollback is required. Keep existing sessions and credentials;
do not reset a database to reverse these presentation changes.

## Verification

See the dated baseline entry in
[Hono migration verification](../hono-migration-verification.md).
Local screenshots are in `.cache/uiux-refresh/before/`.

Implementation is available in [PR #30](https://github.com/narumiruna/fitness/pull/30).
The execution plan at `docs/plans/2026-10-28_training-uiux-refresh-plan.md` is
complete; this document retains its design decisions and implementation sequence.
Implementation and full browser verification are complete. All 137 cases pass
in each development and isolated production HTTPS mode. The verification
document records the remaining command results and local artifact paths. Human usability, physical-device, and real screen-reader testing remain
unverified.

## External handoff

Product reviewers need a disposable test account, a physical device with passkey
hardware, and a real screen reader. Use the existing
[participant guide](web-ui-ux-participant-guide.md) to check unassisted training
entry, current-set recording, results review, focus, and hardware sign-in. The
expected result is successful task completion without data loss or inaccessible
controls. These behaviors are not established by screenshots, axe, or virtual
authenticators. Product acceptance remains a reviewer decision; this PR does not
authorize a deployment or release.
