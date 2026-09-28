# ADR-0002: The Host App decides who sees the widget

**Status:** Accepted, 2026-09-28

## Context
Usually only authenticated admins should see the widget, but some Host Apps will want to show it to end users too.

## Decision
The library has no knowledge of auth, roles, or users. The Host App controls visibility by choosing whether to mount the library, or by passing an `enabled`-style prop.

## Consequences
- The library has no dependency on any auth system.
- Because the widget may be shown to untrusted end users, nothing secret can be shipped to the browser (see ADR-0003).
