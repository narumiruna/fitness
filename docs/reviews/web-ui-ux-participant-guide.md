# Web UI/UX participant checks

## Purpose

Test whether first-time users recognize each screen's purpose and next action
without reading instructions. This procedure does not supply participant results.
Current sample size: **zero**.

Use this guide with [the review report](web-ui-ux-review.md). Do not use production
accounts or data. Obtain participant consent before collecting responses. Use
anonymous IDs P01–P05; do not record names, credentials, or biometric material.

## Session preparation

- Arrange at least five people unfamiliar with the app.
- Record each person's familiarity with strength-training apps and ability to read English or Traditional Chinese. Do not test comprehension in a language the person cannot read.
- Include both locales and both desktop/mobile contexts across the sessions. Record sample size per screen/context, not only the combined total.
- Use the same synthetic states as the browser audit: first entry, empty/populated Workouts, workout creation, active workout, exercise selection/detail, and progress review. Include the other rendered pages for the per-node first-impression check.
- Capture screenshots through `npm run test:ui -- apps/web/e2e/ui-ux-review.spec.ts` on port 8784. This runner creates disposable data, refuses server reuse, and stops its own processes.
  - Static screenshots are suitable for the exposure check only. They cannot establish task completion.
  - For live tasks, use the dedicated session procedure below. Do not reuse a personal development session or retain the audit's authenticated browser beyond runner cleanup.
- Rotate screen order between participants. Record every prior exposure; repeated views do not become fresh first impressions.
- For a redesigned screen, repeat the test with fresh participants or clearly report the learning effect. Do not compare trained and untrained results as equivalent.

## Disposable live session

From the repository root, run one new session per participant:

```sh
npm run test:ui -- --config tests/playwright-participant.config.ts
```

This selects `apps/web/e2e/participant-session.ts`, which is excluded from the
normal automated suite. The root runner owns the temporary database and servers;
the participant configuration preserves the root database guard, port 8784,
no-server-reuse policy, and process cleanup.

The session creates one regular user, one exercise (Bench Press / 槓鈴臥推), and
one routine (Upper body / 上肢課表, one set at 20 kg × 8 reps). It opens a visible
browser already signed in with empty workout history. No credentials need to be
read aloud, recorded, or typed by the participant.

- Before the participant starts, the observer selects the assigned language and sizes the browser for the assigned context. Record the actual CSS viewport dimensions.
- The browser remains available for up to 15 minutes. Record observations in the tables below, outside the application.
- Stop early with Ctrl+C in the owning terminal, or let the session end. The fixture removes its account/exercise on normal exit; the runner disposes of the whole temporary database and stops its own processes, including on cancellation.
- After stopping, confirm no session-owned listeners remain on 8784/8785. Never stop a pre-existing service to make room.
- A normal session-runner exit establishes fixture availability, not a successful human task or comprehension result. Cancellation is not a test pass.

Provisioning/login/cleanup is smoke-tested by the automated audit. The visible
15-minute observation session itself has not been run with participants.

## Predefined scoring

Fix the stimulus, goal, and accepted semantic answers before exposure. Accept
ordinary synonyms in either language; do not require an exact button label. Do not
change accepted answers after seeing a response. Record a reasonable alternative
separately from an incorrect answer, and report ambiguous stimuli rather than
forcing a pass.

| Core stimulus / state | Purpose answer | Intended next action / accepted equivalent | Context to record before exposure |
| --- | --- | --- | --- |
| Login | Sign in to the app | Enter credentials and Sign in; use a passkey is an accepted alternative | No account method preference is assumed |
| Workouts, empty after setup | Record/manage workouts | Create or log the first workout | No active workout or history |
| Workouts, populated with an active session | Find history and current training | Continue the active workout | Returning-user goal is to resume that session; record this task context explicitly |
| Create workout | Record a retrospective workout | Enter/confirm date and create the workout | Title and notes are optional; do not score Start training as equivalent |
| Active workout | Record actual performance in a live session | Enter weight/reps and complete the current set | An incomplete current set is visible; Pause/Finish are alternatives to record, not evidence of this intended action |
| Exercise library | Find an exercise | Search/select the needed exercise and open its history | A suitable exercise already exists; creation is not required |
| Stats, populated | Review training progress | Read the trend/records; choosing a range is an accepted alternative | Read-only understanding is scored; no artificial primary action is expected |

Use the per-node report to define the same purpose/action pair for other screens
before a session. For a page with several valid intents, select and record the
scenario first; do not combine different scenarios into one recognition rate.

## One-second exposure

1. Explain only the procedure: a screen will appear briefly, then the person will answer two questions. Do not explain the app or name its controls.
2. Show the screen for approximately one second, then hide it.
3. Ask: **What is this page for?**
4. Ask: **What would you do next?** For a read-only page, ask **What information does it provide?** instead.
5. Record the actual response and whether it matches the intended purpose/action from the report. Record uncertainty and alternative interpretations; do not coach the answer.

Target: at least four of five participants identify the purpose and intended next
action for each tested core screen. Report results per screen. A small convenience
sample is an early signal, not proof that all users understand the app.

| Participant ID | Locale / reading familiarity | Viewport | Screen / state | Exposure order / prior views | Purpose response | Next-action response | Purpose correct | Action correct | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Not run | — | — | — | — | — | — | — | — | No participant data collected |

## Unassisted tasks

Give the goal without naming controls or navigation routes. Use synthetic records
and participant-specific disposable accounts. Do not supply a tutorial or guide
the participant to the next step. Record a task as assisted if guidance is needed.

1. **First workout:** Record today's workout with one completed Bench Press / 槓鈴臥推 set at 20 kg × 8 reps.
2. **Live training:** Start from Upper body / 上肢課表, record actual values, pause/resume, then finish the session. Observe whether logging a past workout is mistaken for starting training.
3. **Find progress:** Locate the completed workout and find its exercise history or progress information.

Target: at least four of five participants complete each core task without guidance
or a critical error. Also record first-click correctness, wrong turns, help
requests, and any need to read instructional paragraphs. Do not interpret a fast
first impression as success when the subsequent task fails.

| Participant ID | Locale / viewport | Task | First click | Wrong turns | Help requested | Instructional text needed | Outcome / errors | Time / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Not run | — | — | — | — | — | — | — | No participant data collected |

## Report and decision

- Add anonymized actual results to the review report or a linked session record.
- Calculate per-screen purpose/action recognition and per-task completion separately. Preserve failures and context-specific sample sizes.
- Link observed confusion to an existing finding or create a reproducible new finding. Separate a participant's suggestion from an observed task problem.
- Record whether each target passed, failed, or was not tested. No response is not a pass.
- If participants cannot be arranged, obtain explicit user acceptance of that limitation. Leave the plan and goal open until completion or accepted limitations meet the plan's closure rules.
- Also resolve the report's production-mode, physical-passkey, deliberate-cancellation, screen-reader, complete zoom/reflow coverage, and incomplete state-matrix checks, or obtain explicit acceptance of each applicable limitation. The 36 completed zoom samples do not cover every state. Participant testing does not replace those checks.
