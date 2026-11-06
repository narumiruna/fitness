# @narumitw/fitness-contracts

## 1.1.0

### Minor Changes

- eab0096: Add authenticated Streamable HTTP MCP tools for recording, reading, and analyzing personal workouts, with scoped OAuth consent, connected-client revocation, and atomic retry-safe recording.

### Patch Changes

- 961c5c6: Add the private Fitness workspace foundation, shared browser-safe rules, API contracts, and application workspaces. Preserve existing calendar, training, and statistics calculations and date boundaries.
- 688317d: Create a workout without entering its date, title, or notes, while keeping calendar dates and later editing. Add exercise creation to the workout picker and select the new exercise without losing set inputs. Append sets automatically and replace numeric order fields with mouse, touch, and keyboard sorting, with atomic ownership and version checks.
- 0268906: Make live training accessible before workout history, keep ongoing sessions visible independently of history filters, and reveal template setup only after selection. Reduce the mobile header, group utility navigation in an accessible menu, and keep session progress, rest status, and controls beside the current set.
