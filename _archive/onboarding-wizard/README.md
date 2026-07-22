# Onboarding Wizard (archived)

Removed from the live app on 2026-07-22 because it was built against the pre-reorg
architecture (separate Upload/Analytics pages, manual-only repertoire) and needs a
rework to match the current auto-build-from-games flow. Full removal was chosen over
disabling in place because the wizard's hooks were interleaved throughout
`WhiteRepertoire.jsx` and `BlackRepertoire.jsx` (inside move handlers, book-click
handlers, and engine-toggle effects), making a partial/inert version messier than a
clean cut. Git history for these files is preserved via `git mv`, so `git log --follow`
on any file here still shows its original history.

## What it was

A first-login guided tour (`GuidanceModal`) that walked new users through the app
page by page, plus an embedded step-by-step wizard (`RepertoireWizard`) that
spotlighted specific UI elements on the White/Black repertoire pages and the Games
page and waited for the user to perform an action (make a move, pick a book move,
fetch games) before advancing.

## Files

- `context/OnboardingContext.jsx` — global tour state (`tourActive`, `tourStep`,
  per-wizard completion flags in localStorage), exposed via `useOnboarding()`.
- `components/GuidanceModal.jsx` (+ `.css`) — the page-by-page tour overlay. Owns the
  `STEPS` array mapping each tour step to a route + CSS selector to spotlight.
- `components/RepertoireWizard.jsx` (+ `.css`) — the spotlight/tooltip UI used for the
  in-page wizards (draws a highlight box around a target element via
  `getBoundingClientRect`, with a floating tooltip).
- `components/wizardSteps.js` — step definitions consumed by `RepertoireWizard`:
  `WHITE_WIZARD_STEPS`, `BLACK_WIZARD_STEPS`, `GAMES_WIZARD_STEPS`.

## How it was wired in (for when this gets rebuilt)

- `App.jsx` — wrapped the app in `<OnboardingProvider>`; rendered `<GuidanceModal
  open={tourActive} onClose={skipTour} />` above the router; passed `startTour` to
  `Navbar`.
- `Navbar.jsx` — `?` help button called `onOpenGuidance` (= `startTour`); pulsed via
  `tourActive && tourStep === 9`.
- `Home.jsx` — showed a `NewUserWelcomeBanner` for authenticated users where
  `!onboardingComplete && !tourActive`, with "Start the Tour" / "Skip" actions from
  `useOnboarding()`.
- `WhiteRepertoire.jsx` / `BlackRepertoire.jsx` — each held local `wizardStep` /
  `wizardDismissed` state (persisted to `localStorage` as `wizard_white_seen` /
  `wizard_black_seen`); an `advanceWizard(trigger)` helper matched the current step's
  `advanceOn` string against events like `'first-move'`, `'book-click'`,
  `'engine-mode-on'`, `'review-entered'`; a `useEffect` synced with `tourActive`/
  `tourStep` from the global context to reset the local wizard when the guided tour
  arrived at that page (`tourStep === 1` for White, `=== 2` for Black). Completion
  dispatched a `window` CustomEvent (`wizard-complete`, detail `'white'`/`'black'`)
  that `OnboardingContext` and `GuidanceModal` listened for to advance the outer tour.
- `Games.jsx` — same pattern, `wizard_games_seen`, synced on `tourStep === 5`, fired
  `wizard-complete` with detail `'games'`.

## Rebuilding later

The old step selectors (e.g. `.rep-board-panel > div`, `.book-panel`,
`.engine-panel`, `.filter-card`, `.import-bar`) and route assumptions in
`wizardSteps.js` and `GuidanceModal.jsx`'s `STEPS` array should be re-checked against
the current DOM/routes before reuse — some may have shifted since this was archived.
The overall spotlight/tooltip mechanics in `RepertoireWizard.jsx` are UI-agnostic and
should still be reusable as-is.
