# Mobile Book Panel Redesign: Full-Screen Slide-In

## Problem

Current mobile bottom sheet has two persistent issues:
1. **iOS Safari shadow artifact** — after closing the panel via X button, a semi-transparent black bar remains at the top of the viewport. Multiple body scroll lock approaches (`position: fixed`, `overflow: hidden`, `overscroll-behavior`) have failed to eliminate this.
2. **Gesture conflicts** — drag-to-close competes with content scrolling, making the interaction unreliable.

## Decision

Replace the mobile bottom sheet with a full-screen slide-in page. This eliminates the need for body scroll lock entirely, since the full-screen page handles its own scrolling natively.

Desktop (≥600px) keeps the existing right-side drawer unchanged.

## Mobile Layout (≤599px)

```
┌─────────────────────┐
│  ‹                  │  ← back button, sticky top-left
│                     │
│ [cover] title       │
│         author      │  ← book info section
│         rating      │
├─────────────────────┤
│ summary ▸           │  ← collapsed by default, 1 line
├─────────────────────┤
│ review ▸            │  ← collapsed by default
├─────────────────────┤
│ highlights│thoughts │popular │  ← tabs
│                     │
│  note content...    │  ← scrollable
│                     │
└─────────────────────┘
```

### Behavior

- **Entry**: slides up from `translateY(100%)` to `translateY(0)`, 300ms ease
- **Exit**: back button click, reverse slide out
- **Back button**: `position: sticky; top: 0`, left-aligned, 44×44px touch target, iOS-style `‹` chevron (24px), background `var(--bg)` with 80% opacity + `backdrop-filter: blur(8px)`, z-index above content
- **Main page scroll position**: preserved when panel opens/closes (full-screen page is a sibling overlay, not replacing the body content)
- **Summary**: collapsed by default, shows 1 line, tap to expand
- **Review**: collapsed by default, tap to expand
- **No drag-to-close gesture** — avoids conflict with page scrolling
- **No body scroll lock** — page scrolls natively

## Desktop Layout (≥600px)

No changes. Keep existing right-side drawer:
- Slides in from right, width `min(480px, 90vw)`
- Close via overlay click or X button
- Body scroll lock remains (desktop browsers handle it correctly)

## Shared Logic

- Content rendering (highlights, thoughts, popular highlights) shared between mobile and desktop
- Tab switching logic shared
- Chapter ordering by `chapterIdx` (ascending) shared
- Only layout, entry/exit animation, and close mechanism differ by breakpoint

## Key CSS Changes

### Remove (mobile media query only)
- `.book-panel` bottom sheet overrides (`top: auto; bottom: 0; height: 85dvh; border-radius`)
- `.panel-drag-bar` and all drag-related styles
- Body scroll lock JS for mobile (desktop retains it)

### Add (mobile only)
- `.book-panel` full-screen: `position: fixed; inset: 0; width: 100%; height: 100%`
- `.panel-back-btn` sticky back button with semi-transparent background
- Slide-in/out animation from bottom

### Keep (desktop)
- Existing right-side drawer styles
- Overlay and close button
- Body scroll lock for desktop

## Files to Modify

- `template.js` — CSS styles + JS panel logic
- Rebuild yearly HTML after changes
