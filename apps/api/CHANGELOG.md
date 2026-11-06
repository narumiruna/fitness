# @narumitw/fitness-api

## 1.1.0

### Minor Changes

- eab0096: Add authenticated Streamable HTTP MCP tools for recording, reading, and analyzing personal workouts, with scoped OAuth consent, connected-client revocation, and atomic retry-safe recording.

### Patch Changes

- 961c5c6: Add the private Fitness workspace foundation, shared browser-safe rules, API contracts, and application workspaces. Preserve existing calendar, training, and statistics calculations and date boundaries.
- f63805e: Verify full-length passwords while retaining legacy bcrypt access. Correct Unicode exercise creation, cleared workout text, recorded weight precision, skipped-set presentation, month-end exercise trends, and progression acceptance after warm-up sets.
- 688317d: Create a workout without entering its date, title, or notes, while keeping calendar dates and later editing. Add exercise creation to the workout picker and select the new exercise without losing set inputs. Append sets automatically and replace numeric order fields with mouse, touch, and keyboard sorting, with atomic ownership and version checks.
- a2fe7e6: Accept trailing slashes in PASSKEY_ORIGIN and use the canonical HTTPS origin for startup, CSRF checks, and passkeys. Continue to reject paths, queries, fragments, credentials, and untrusted request origins.
- 0268906: Make live training accessible before workout history, keep ongoing sessions visible independently of history filters, and reveal template setup only after selection. Reduce the mobile header, group utility navigation in an accessible menu, and keep session progress, rest status, and controls beside the current set.
- 99430a1: Simplify workout, exercise, measurement, and supporting page hierarchies. Preserve exercise filter state, clarify security feedback and missing-page recovery, confirm passkey removal, and correct responsive chart and disabled-action states. Serve the localized app recovery screen with HTTP 404 for extensionless unknown browser paths while keeping API, machine, asset, and traversal failures isolated.
- Updated dependencies [961c5c6]
- Updated dependencies [eab0096]
- Updated dependencies [f63805e]
- Updated dependencies [688317d]
- Updated dependencies [0268906]
  - @narumitw/fitness-core@1.1.0
  - @narumitw/fitness-contracts@1.1.0
