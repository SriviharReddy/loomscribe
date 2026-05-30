# Android Technical Debt

Scope: this document covers the Android branch architecture (`feature/android-serverless-port`) as reviewed from the current repository state. It is a technical snapshot, not a product roadmap. The items below are limited to code quality, correctness, maintainability, and operational risk.

## Critical

### 1. `window.fetch` is used as a full mock backend in `www/js/db.js`

The Android branch replaces server routing with a global `window.fetch` interceptor and implements API endpoints, persistence, and some domain logic inside one file.

Why this is critical:
- It couples transport, routing, storage, and business rules into one runtime hook.
- Any future `fetch` usage must be mentally audited against the interceptor.
- It is difficult to unit test because the logic depends on global browser state.
- Bugs in the shim can break every API call at once.

Why it matters:
- This is the main architectural bottleneck in the Android branch.
- It makes incremental refactors expensive and risky.

Mitigation plan:
- Introduce an explicit `apiClient` module that exposes named methods such as `getConversations`, `createMessage`, and `streamCompletion`.
- Move endpoint-specific logic out of the global fetch interceptor into service functions that can be called directly.
- Keep a thin compatibility fetch shim temporarily so existing UI calls do not need to change all at once.
- Migrate one endpoint group at a time, starting with conversations and messages.
- Remove the global fetch override once all internal callers use the service layer.

### 2. The API key is stored and used on-device in client-managed state

The Android branch keeps the DeepSeek key in IndexedDB-backed config and uses it directly from the app runtime.

Why this is critical:
- The key is accessible to the client runtime and therefore to anyone who can inspect the app storage or runtime state.
- There is no server-side boundary to protect secrets.
- Any leakage affects the user’s account, not just the app session.

Why it matters:
- This is acceptable only for a personal/local prototype.
- It is a poor default for a distributable Android build.

Mitigation plan:
- Decide whether Android is intended to remain a user-supplied-key app or become a managed-key app.
- If it remains user-supplied, store the key through a native secure-storage bridge instead of ordinary IndexedDB.
- If it becomes managed-key, move completion calls behind a server-side proxy and remove direct provider calls from the app.
- Add clear key lifecycle operations: save, validate, replace, and delete.
- Avoid logging request headers, config objects, or errors that may include the key.

### 3. Successful UI states are not always tied to durable persistence

Conversation creation and assistant streaming still assume success too early in the UI flow.

Why this is critical:
- A message can appear complete even if the backing IndexedDB write fails.
- A created conversation can be selected before the record is durably available.
- Failures can become silent data loss rather than visible errors.

Why it matters:
- Data loss is worse than a visible error because it is hard for users to recover from.

Mitigation plan:
- Treat every write as pending until IndexedDB confirms success.
- For conversation creation, only update `state.currentConversationId` after the returned record has a valid id.
- For streamed assistant responses, persist a local draft before or during streaming so partial results can survive write failure.
- Mark unsaved messages visibly in state metadata and retry persistence when the app returns online or the next conversation refresh runs.
- Make save failures propagate back to the caller instead of being hidden behind a completed UI state.

## High

### 4. ID generation is still time-based and collision-prone under concurrency

The branch uses `Date.now()` plus a small random component for conversation/message/prompt IDs.

Why this is high risk:
- Parallel writes, fast imports, or repeated operations can collide.
- ID generation is distributed across multiple call sites instead of being centralized.

Why it matters:
- Duplicate IDs can corrupt message trees, prompt records, or conversation history.

Mitigation plan:
- Centralize ID creation in one utility module.
- Prefer `crypto.randomUUID()` for new records if string IDs are acceptable.
- If numeric IDs are required for compatibility, use IndexedDB auto-increment keys or a monotonic local sequence store.
- Add collision checks before insert for imported prompts and generated messages.
- Normalize all route and query handling so IDs are consistently parsed as either strings or numbers, not both.

### 5. Tree/version behavior is duplicated across several layers

Message activation, version selection, and descendant traversal are implemented in multiple places:
- `www/js/api.js`
- `www/js/ui.js`
- `www/js/db.js`

Why this is high risk:
- Rules can drift between the UI layer and the mock API layer.
- Changes to versioning behavior require editing several files in lockstep.

Why it matters:
- This is a common source of subtle regressions in branchy conversation systems.

Mitigation plan:
- Create a dedicated message-tree service for descendant lookup, version activation, regeneration, and navigation.
- Make UI code request tree operations from that service instead of manually mutating records.
- Keep persistence writes inside the service so state transitions happen in one place.
- Add focused tests or fixtures for branching, regeneration, version switching, and descendant hiding.
- Remove duplicate traversal helpers from `www/js/api.js` once the service owns the behavior.

### 6. The fetch shim is a growing conditional router with weak separation of concerns

`www/js/db.js` now acts like a server, database adapter, and transport layer at the same time.

Why this is high risk:
- Every new endpoint adds more branching to a single file.
- Endpoint behavior is easy to make inconsistent.
- Error handling is repeated manually in each route branch.

Why it matters:
- The file will keep getting harder to change as features grow.

Mitigation plan:
- Split `www/js/db.js` into storage, route adapter, and provider client modules.
- Define route handlers as a map from method/path pattern to handler function while the shim still exists.
- Share response helpers for JSON success, JSON errors, and validation failures.
- Keep IndexedDB transaction logic out of endpoint handlers.
- Retire this item after the fetch shim is either removed or reduced to a narrow compatibility layer.

### 7. IndexedDB schema versioning is minimal

The database wrapper currently initializes stores and seeds config, but it does not show a robust migration strategy beyond the initial schema.

Why this is high risk:
- Once the schema changes, upgrades can become manual or lossy.
- There is no clear migration story for existing installs.

Why it matters:
- Mobile apps need predictable upgrade behavior because users keep old data across app releases.

Mitigation plan:
- Add an explicit schema version constant and migration registry.
- Write migrations as small version-to-version steps instead of one large upgrade block.
- Include default data backfills for new required fields.
- Add a small integrity check after startup to detect missing stores, missing indexes, or malformed records.
- Document what user data is preserved across each migration.

### 8. State is split across multiple persistence mechanisms without a clear boundary

The branch uses:
- IndexedDB for core data
- `localStorage` for UI prefs like active conversation and collapsed categories
- in-memory module state for runtime coordination

Why this is high risk:
- There is no single source of truth.
- Restoring app state requires reconstructing context from multiple stores.

Why it matters:
- The more places state lives, the easier it is to create hard-to-reproduce bugs.

Mitigation plan:
- Define which state belongs in IndexedDB, which belongs in `localStorage`, and which should remain memory-only.
- Move durable app preferences into a single settings store where practical.
- Keep ephemeral UI state, such as open menus, out of durable storage unless restoration is intentional.
- Add one bootstrap function that restores state in a deterministic order.
- Remove duplicate `localStorage.setItem('activeConversationId', ...)` calls once state restoration has a single owner.

## Medium

### 9. Error handling is mostly optimistic and UI-centric

Most operations assume success and fall back to toasts or silent no-ops when something fails.

Why this is medium:
- The app usually keeps working, but failures are not always propagated to the caller.
- Some failures become partial state instead of explicit rollback.

Why it matters:
- This makes debugging and recovery harder than it needs to be.

Mitigation plan:
- Introduce a small error/result convention for service calls.
- Make write operations return explicit success or failure objects rather than relying on `res.ok` checks scattered across UI code.
- Keep user-facing toasts at the UI boundary, not inside low-level persistence functions.
- Add rollback or retry behavior for operations that mutate UI before persistence.
- Log technical errors with enough context to debug without exposing secrets.

### 10. Message-tree operations are potentially inefficient

Descendant traversal and version visibility logic repeatedly scan the full message list.

Why this is medium:
- The logic is straightforward, but it does not scale cleanly as conversations grow.
- Repeated filtering is fine for small datasets and increasingly wasteful for large ones.

Why it matters:
- Mobile devices are less forgiving of unnecessary repeated scans.

Mitigation plan:
- Add IndexedDB indexes for fields commonly used in traversal, especially `conversationId`, `parentMsgId`, and `versionGroupId`.
- Build in-memory maps per conversation during tree operations instead of repeatedly filtering arrays.
- Batch related updates in a single transaction where possible.
- Measure behavior on large synthetic conversations before adding complex optimization.
- Keep the simple code path for small conversations if measurement shows no real bottleneck.

### 11. API behavior is mocked in the browser instead of being factored into a reusable service layer

The Android branch emulates backend endpoints in the frontend runtime rather than isolating a data service abstraction.

Why this is medium:
- It is harder to reuse the data layer outside the UI.
- It blurs the line between app logic and infrastructure.

Why it matters:
- This makes future architectural changes more disruptive than necessary.

Mitigation plan:
- Define a platform-neutral app service interface for conversations, messages, prompts, config, and completions.
- Implement an IndexedDB-backed Android service behind that interface.
- Keep the browser/dev server path as a separate implementation if needed.
- Make UI modules depend on the interface rather than on `fetch('/api/...')`.
- Use this as the long-term replacement for the compatibility fetch shim.

### 12. Validation is shallow in several request paths

Input payloads are often parsed and used with minimal normalization.

Why this is medium:
- Bad data can slip through and only fail later in a different part of the app.

Why it matters:
- Early validation reduces downstream corruption and makes error messages clearer.

Mitigation plan:
- Add lightweight validators for conversation, message, prompt, and config payloads.
- Reject missing required fields before writing to IndexedDB.
- Normalize IDs, timestamps, roles, and booleans at the service boundary.
- Return consistent validation errors that the UI can display or log.
- Add import-specific validation for ZIP and prompt-card ingestion.

## Low

### 13. Legacy naming still leaks through the branch

Some package names, file names, and docs still reflect earlier project naming and evolution.

Why this is low:
- It does not break correctness.
- It increases cognitive load when navigating the codebase.

Why it matters:
- Naming drift accumulates and makes future refactors harder to explain.

Mitigation plan:
- Pick the canonical product, package, and database names before making another release.
- Rename only low-risk user-facing labels first.
- Defer package/database renames until there is a migration and release plan.
- Document intentionally retained legacy names so future contributors do not "clean them up" accidentally.

### 14. Large modules remain hard to scan

`www/js/ui.js` and `www/js/db.js` are both large and multi-purpose.

Why this is low:
- It is not immediately dangerous.
- It does, however, slow down safe maintenance work.

Why it matters:
- The next person to touch these files will spend more time understanding them than changing them.

Mitigation plan:
- Split files along behavior boundaries rather than by arbitrary size.
- Extract stable helpers first: storage adapter, message-tree service, prompt service, and completion client.
- Keep public function names stable while moving implementations.
- Avoid broad formatting-only commits while splitting modules.
- Add a short module map to the README once the layout stabilizes.

## Suggested Priority Order

1. Split the `window.fetch` shim into a real data/service layer.
2. Add a durable secret-handling strategy for the API key.
3. Tighten failure propagation for conversation creation and streaming save paths.
4. Replace time-based ID generation with a collision-resistant strategy.
5. Introduce explicit IndexedDB migrations before the schema grows further.

## Notes

- This document is intentionally conservative. It focuses on technical risk, not feature gaps or visual polish.
- Some items are acceptable for a prototype but should still be tracked because they become expensive quickly as the Android branch grows.
