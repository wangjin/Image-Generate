# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

- **Do NOT hand-roll the WKWebView first-click workaround.** macOS WKWebView
  swallows the first `click` after a textarea/input gains focus. Always use the
  shared `pressFix(action)` from `src/lib/pressFix.ts` via
  `<button {...pressFix(action)}>`. See Gotchas below for why the naive
  `onMouseDown`-only pattern is forbidden.

<!-- Patterns that should never be used and why -->

---

## Gotchas

### pressFix: mousedown fallback must suppress the follow-up click

History: 359a9af fixed the swallowed first click by running the action at
`mousedown` when focus is still in an input. Two non-obvious traps when extending it:

1. **Double-fire on non-first clicks.** `preventDefault()` at `mousedown` keeps
   focus in the textarea, so every subsequent button press re-triggers the
   fallback while the (non-first) `click` may also arrive. Any unguarded action
   (e.g. add/remove row) would run twice. `pressFix` therefore swallows the
   follow-up click via a module-level 1s timestamp window.
2. **The window marker must not live in a closure.** An async action re-renders
   the component between `mousedown` and `click`, replacing the handler and
   losing a closure-scoped flag — the follow-up click would then re-run the
   action against fresh state (e.g. turning a just-started submit into a stop).
   Keep the marker at module scope, and keep actions idempotent or guarded.

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
