# Account Settings UI Review

## Round 01 — version 1

Status: **B-v1 implemented; iteration stopped by the user**. After the three-way comparison, the user selected **3 (Stop)** and requested a pull request. ACC-01 through ACC-03 meet the checks below; ACC-04 remains deferred. Original baselines and all alternatives remain unchanged. Stopping the iteration does not establish release readiness.

Scope: `/account/password`, `/account/passkeys`, and `/account/connections`. Alternatives compare the password page and a shared account layout. Passkey list density is deferred. Keep password validation, passkey recovery guidance, agent permissions, confirmation dialogs, focus behavior, and global navigation.

### Capture conditions

| Property | Recorded value |
| --- | --- |
| Product revision | `83cdb47` on `narumi/feat/otter-ui-redesign` |
| Runner | `npm run test:ui -- account-settings-review.spec.ts`; disposable SQLite; no server reuse |
| Browser | Chromium `156.0.8078.4`, headless |
| Viewports | 1440 × 900, 768 × 1024, 390 × 844, 320 × 844; device scale 1 |
| Locale | Traditional Chinese and English |
| Appearance | Existing fixed light theme, green/sage, reduced motion |
| Time zone | `Asia/Taipei` |
| Synthetic account | `alex`, USER role |
| Saved data | Two nonfunctional synthetic passkeys; one Training assistant connection with read/write scopes |
| Dates | Created `2026-10-31T04:00:00.000Z`; connection expires `2030-01-01T00:00:00.000Z` |
| Default state | Empty forms, no dialog, scroll position recorded per capture |
| Additional states | Invalid length, mismatch, routed current-password error, routed success, passkey removal dialog, agent revocation dialog |

Error/success query routes are UI-state evidence, not evidence that server password changes passed. Native invalid-length and mismatch feedback were triggered through the form. Removal dialogs were opened and cancelled; no physical passkey ceremony was attempted.

### Artifacts

Root: `test-results/account-settings-review/round-01/`. These are ignored local review files; do not commit images, databases, or browser traces.

- `baseline-v1/`: immutable original capture attempt; 17 states and 34 screenshots. The first accessibility failure stopped that attempt.
- `baseline-v2/`: complete supplementary capture from the same product revision and fixture conditions; 48 states and 96 screenshots. It retains all accessibility failures instead of stopping before the affected screenshots.
- Both baseline manifests record routes, viewports, headings, account links, scroll positions, geometry, image names, and audit results. Version 2 also records exact contrast data.
- `tooling/capture-v1.spec.ts` and `capture-v2.spec.ts`: retained capture source. Corresponding logs are in the same directory.
- `capture-run-v1/` and `capture-run-v2/`: Playwright reports, traces, and failure evidence.
- `designs-v1/{A,B,C}-v1.png`: generated alternatives, each 1536 × 1024. Prompts and generation records are retained beside them.
- C's first invocation was rejected before generation because B was still running. Its rejection record is retained; C was then generated sequentially.
- `gallery.html`: local index of the original baseline, design alternatives, and complete capture matrix.

Use `baseline-v1/password-default-zh-TW-1440x900-viewport.png` and `password-default-zh-TW-390x844-viewport.png` as the original password comparison pair. Do not replace them with the next round.

### Findings

These observations describe the original baseline. ACC-01 through ACC-03 are now resolved against their automated checks; ACC-04 remains deferred. User effects are inferred from the observed UI; no usability study was performed.

#### ACC-01 — Account navigation changes between routes

Priority: P2. Status: resolved in implemented-v2; subjective review pending.

- Evidence: original password screenshots above; `baseline-v2/passkeys-two-saved-zh-TW-1440x900-viewport.png`; `baseline-v2/connections-one-saved-zh-TW-1440x900-viewport.png`.
- Observation: password/passkeys have two security links and a detached agent link. The agent page replaces them with a single Account return link. The three account routes have no consistent shared account context.
- Effect: users must learn different navigation patterns to move between related settings.
- Acceptance: all three routes expose the same named account navigation with all three existing destinations and exactly one `aria-current="page"`. Keep the selected-page title as the single main h1. Verify route changes and keyboard use in both locales at all four baseline widths. Do not change the global sidebar or bottom navigation.

#### ACC-02 — Local navigation lacks the existing control treatment

Priority: P2. Status: resolved in implemented-v2; subjective review pending.

- Evidence: `baseline-v1/password-default-zh-TW-390x844-viewport.png`; `baseline-v2/password-default-en-1440x900-viewport.png`; account links in both manifests.
- Observation: account destinations appear as plain underlined text on separate lines. The current password/passkey route relies mainly on bold text; there is no grouped control surface or strong selection marker. This differs from the global navigation treatment.
- Effect: account navigation is less distinct from ordinary content links, especially on narrow screens.
- Acceptance: use a consistent group with a non-color selection indicator and local link hit areas at least 44px high. Keep complete translated labels, visible keyboard focus, and no horizontal document overflow at 320px. Password labels, inline length help, error locations, and submit action must remain clear and ordered. Generated layouts are proposals, not evidence that these conditions already pass.

#### ACC-03 — Revocation Cancel button fails text contrast

Priority: P1 accessibility failure. Status: resolved in implemented-v2. The baseline failure is retained; the default password design images do not show this dialog.

- Evidence: `baseline-v2/connection-revoke-confirmation-zh-TW-390x844-viewport.png` and `baseline-v2/manifest.json`.
- Observation: axe reports `color-contrast` on the Cancel button in both locales at desktop and mobile widths. Measured foreground `#1e8255`, background `#e6f6eb`, 14px normal text: **4.28:1**, below **4.5:1**.
- Effect: the non-destructive exit action has insufficient text contrast.
- Acceptance: at least 4.5:1 text contrast in the light-theme dialog in all four audited locale/viewport combinations. Preserve the named alertdialog, initial Cancel focus, Escape cancellation, trigger focus return, and no revocation on cancel. Fix only the account dialog treatment, not the global theme.

#### ACC-04 — Saved passkeys have low information density

Priority: P3. Deferred; not part of design selection or implementation approval for this round.

- Evidence: `baseline-v2/passkeys-two-saved-zh-TW-1440x900-viewport.png` and `passkeys-two-saved-zh-TW-390x844-full.png`.
- Observation: each saved name and Delete action occupies a separate tall card, without a list section heading. The second card continues below the mobile viewport.
- Effect: scanning several credentials requires more scrolling. Content below the viewport is not, by itself, missing or inaccessible.
- Future acceptance proposal: a named saved-key section with compact name/action rows, at least 44px action targets, preserved deletion confirmation/focus, and no loss of data or recovery guidance. Review a dedicated passkey design before changing this presentation.

### Generated alternatives

All alternatives use the same password content, empty form state, Traditional Chinese locale, existing light palette, and intended desktop/mobile viewports. They preserve the three existing account destinations and the global shell.

| Version | Direction | Findings | Trade-off |
| --- | --- | --- | --- |
| A-v1 | Account workspace: secondary local rail on desktop; grouped stacked local rows on mobile | ACC-01, ACC-02; ACC-03 as a scoped dialog correction | Strong orientation, but more navigation width/height |
| B-v1 | Focused tabs: one bounded column and three local navigation links with an underline indicator | ACC-01, ACC-02; ACC-03 as a scoped dialog correction | Less navigation height; long translations need wrapping |
| C-v1 | Form with contextual guidance: wrapped route controls; desktop form plus existing-rule guidance | ACC-01, ACC-02; ACC-03 as a scoped dialog correction | Uses desktop width; repeated guidance adds text |

Image limitations:

- Generated images are design guidance, not browser captures or pixel-accurate viewport measurements. Captioned viewports are implementation targets.
- Keep the existing global icons, fonts, header, sidebar, and mobile bar. Generated icon substitutions, button textures, status bars, and shell-size changes are not proposed changes.
- C contains duplicate guidance beneath the mobile form. That duplicate is a generation error: keep guidance inline with its related field on mobile, not in a second block.
- Preserve existing localized rules and error copy. Do not reproduce incorrect generated glyphs, add password reveal controls, introduce profile/session/theme features, or infer accessibility from an image.
- Passkey and agent page content retain their current behavior and list presentation in this round. Only their shared account context/navigation changes under the selected layout.

### Verification before selection

- `npm run check`: passed during capture preparation.
- Scoped Biome check of capture-v2: passed.
- Capture-v2 completed all 48 samples and 96 PNGs with zero measured horizontal document overflow.
- Local invalid-length feedback, mismatch focus, Escape cancellation, and dialog trigger-focus return assertions completed.
- The capture test **failed** its final accessibility assertion: 4 of 24 audited samples have ACC-03; the other 20 reported no violations for the configured axe tags. This is not an accessibility pass or an approved exception.
- No password-change request was sent during capture; both saved fixture passkeys remained until fixture cleanup.
- The runner stopped its own services and removed its disposable database. Ports 8784/8785 were not listening afterward.
- At that point, no product implementation or new-design verification had occurred. Physical-device and real assistive-technology checks remain unverified.

### Implementation and visual verification — B-v1

The shared account layout uses a centered column with a 720px maximum width and three ordinary route links with an underline selection marker. The password title is inside its card, the length rule is next to its field, and the full-width submit button has a separated footer. The account dialog Cancel action uses the existing high-contrast gray Radix variant. No API, schema, global shell, font asset, or passkey-card redesign was added.

| Finding | Evidence | Result |
| --- | --- | --- |
| ACC-01 | `implemented-v2/manifest.json`; new account settings layout/keyboard tests | All three routes share the same navigation, retain one selected link and one main h1, and support Tab/Enter navigation in both locales at four widths |
| ACC-02 | `comparisons-v1/mobile.png`, `desktop.png`; same manifest and tests | Minimum measured local-link height 56px; full labels and focus treatment retained; zero document overflow in all 48 samples |
| ACC-03 | `implemented-v2/connection-revoke-confirmation-zh-TW-390x844-viewport.png`; mounted-dialog tests | All 24 screenshot audits pass; eight locale/viewport dialog cases assert Cancel contrast at least 4.5:1 and preserve cancellation/focus |
| ACC-04 | Existing saved-key cards | Deferred; content and card presentation retained |

#### Refinements and test findings

- ACC-05, P2, resolved: implementation capture v1 left one Chinese character on the second line of the mobile agent label. The observed effect was uneven line balance, not lost content. Acceptance: retain the complete label without that orphan at 390px and 320px, with no horizontal overflow. `text-wrap: balance` resolves this in capture v2. Both capture versions remain available. This is a B-v1 wrapping refinement, not a new design round.
- The first HTTPS regression run passed 58 of 59 cases. Its trace shows the permanent-read-failure test dispatching programmatic navigation before the initial main region mounted. The test now waits for the initial password h1 before dispatch; its focus assertions, timeouts, and zero-retry setting are unchanged. The complete second HTTPS run passed all 59. The first failure, screenshot, and trace remain under `https-regression-v1/`; no global focus implementation was changed.

#### Actual checks

- `npm run check`: passed after implementation and in the final state. `prek run -a` and `git diff --check` also passed.
- `npm run build`: passed, including the final CSS during the HTTPS runner's rebuild. The existing large-chunk warning remains; it is not a build failure.
- `npm test`: passed.
- `npm run test:ui -- account-settings.spec.ts security-feedback.spec.ts passkeys.spec.ts passkey-challenges.spec.ts mcp.spec.ts`: 59 passed, no retries.
- The same five-file subset through `npm run test:ui:production`: 59 passed on its complete second run, using disposable PostgreSQL, local HTTPS, and the built frontend. Initial failed-run evidence is retained above.
- `npm run test:ui -- otter-ui.spec.ts`: one complete shell/reflow case passed in both locales, including account routes. This does not mean every repository browser test was run.
- Final screenshot workflow: one case passed, 48 states and 96 original PNGs under `implemented-v2/`; all 24 selected axe audits passed. Conditions match the original full baseline for route, viewport, locale, theme, browser, time zone, fixture data, and state. Scroll positions are recorded separately because focused-field and modal scrolling can change with layout.
- Virtual WebAuthn registration, failure/replay checks, sign-in, removal, password change, and agent authorization/revocation ran against disposable HTTP/HTTPS stacks. Virtual authenticators do not verify physical hardware.

#### Retained comparison and final handoff

- `comparisons-v1/desktop.png` and `mobile.png`: original screenshot, selected B-v1 crop, implemented screenshot. Crop coordinates and product-source SHA-256 hashes are recorded in `comparisons-v1/comparison.json`; the generated B-v1 image is unchanged.
- `implemented-v1/` and `implemented-v2/`: successive implementation captures. The only visual refinement between these versions is the balanced account-link wrapping.
- `tooling/`: capture source, comparison generator, and actual check/run logs. `review-selected-B-v1.md` and `gallery-before-implementation.html` preserve the pre-implementation review state.
- `gallery.html`: updated comparison index with original baselines, every design alternative, and implemented captures.

The user reviewed the three-way comparison and selected Stop. No next round is authorized. The following items remain outside this iteration:

- UI owner: ACC-04 remains deferred. A new design review is required before changing saved-passkey presentation; the expected result is a separately approved layout, not an automatic follow-up implementation.
- QA/product owner: with access to the retained local gallery, an authorized non-production test account, physical devices, and assistive technology, verify actual-device layout, screen-reader behavior, and hardware passkey flows. The expected result is a recorded usable workflow; those checks and subjective visual acceptance remain unverified here.
- Release owner: obtain green results from the existing complete Node 24 CI workflows for the delivered revision before release. Local Node 26 subset results do not replace that gate. Production deployment, publication, and release tags require separate authorization.

### User decisions and review gates

- Before review point 3: no design was selected and no implementation was authorized.
- Round 01, version 1: all three alternatives were displayed; the user replied **B**. B-v1 is approved.
- Review point 5: desktop/mobile original, B-v1, and implemented comparisons were displayed with resolved/deferred findings and verification limits. The user replied **3, open pr**: stop the iteration and prepare a pull request. No round 2 will start.
- Approved scope: B-v1 shared account layout/password presentation and ACC-01 through ACC-03. ACC-04 remains deferred.
- A revision request is not implementation approval. Preserve previous images and issue a new affected version for confirmation.
- Do not implement until explicit selection. If a material change to the selected design is needed, request approval first.
- Both required user review points are complete. The coding plan can close; remaining external checks are retained above.
- The latest request authorizes the intended commit, branch push, and pull request. It does not authorize deployment, package publication, or release tags.
- Delivery uses `narumi/feat/account-settings-tabs` from `origin/main` at `50452af`. That merge commit has the same tree as screenshot baseline `83cdb47`; PR #33 already contains the earlier redesign and comparison report.
