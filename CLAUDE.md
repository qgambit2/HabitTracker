# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

A habit-tracker demo app built with Expo (React Native) targeting iOS, Android, and web. Track daily habits (check-off or counted), keep streaks, run time-boxed challenges, and get a multi-sensory reward when you complete one.

## Critical version constraint

This project is **pinned to Expo SDK 54** (`expo: ~54.0.x`) on purpose: the owner's phone runs the App Store build of **Expo Go, which only supports SDK 54**. The published Expo Go binary lags the newest SDK, so "upgrade to the latest SDK" silently breaks on-device testing — the app refuses to load with an SDK-mismatch error.

Do **not** bump `expo` or the `expo-*` / `react-native` / `react` versions without an explicit request. If a newer SDK is genuinely needed, switch the device-testing story to a [development build](https://docs.expo.dev/develop/development-builds/introduction/) rather than relying on Expo Go. As `AGENTS.md` notes, consult the **version-pinned** docs (https://docs.expo.dev/versions/v54.0.0/) before writing Expo code — the API surface shifts between SDKs.

Local notifications and `expo-audio` are used precisely because they work in Expo Go on SDK 54; **remote push does not**, so don't reach for it.

## Commands

```bash
npm install            # install dependencies
npx expo start         # start the Metro dev server (QR code for Expo Go, plus i/a/w/r shortcuts)
npm run ios            # start + open iOS simulator
npm run android        # start + open Android emulator
npm run web            # start + open web build
npm run lint           # eslint (eslint-config-expo)
npx tsc --noEmit       # type-check (strict mode)
npx expo-doctor        # validate dependency versions against the SDK
node scripts/generate-chime.js   # regenerate the committed reward chime asset
npm run reset-project  # ⚠️ destructive scaffolding helper — moves app/ to app-example/ and blanks app/. Not for normal dev.
```

There is **no test framework configured** (no test runner, no test files). Verify changes via `tsc`, `expo-doctor`, and running the app — don't claim tests pass.

To launch in a fresh macOS Terminal window (so the interactive QR/shortcuts work), this project has used:
`osascript -e 'tell application "Terminal" to do script "cd <project> && npx expo start"'`.

## Architecture

**Routing — Expo Router (file-based), under `app/`:**
- `app/_layout.tsx` — root `Stack`; wraps everything in React Navigation's `ThemeProvider` (light/dark). Declares the `(tabs)` group plus three modal screens: `modal` (celebration), `onboarding`, and `settings`. Also runs two app-startup side effects at module load: `setAudioModeAsync` (native only — lets the chime mix/play in silent mode) and `registerNotificationHandler`.
- `app/(tabs)/_layout.tsx` — the `<Tabs>` bar with **three** tabs: **Today** (`index`), **Progress** (`explore`), and **History** (`history`). (The `index`/`explore` filenames are leftovers from the template; the user-facing titles were renamed.)
- `app/(tabs)/index.tsx` — **Today**: habit list, inline add-habit field (with a check-vs-count kind toggle and a per-day target for counts), challenge banner, and the reward burst. First launch redirects to onboarding.
- `app/(tabs)/explore.tsx` — **Progress**: consistency chart + completion grid over a 7/30-day window.
- `app/(tabs)/history.tsx` — **History**: newest-first timeline of completed days, grouped across all habits.
- `app/onboarding.tsx` — first-launch welcome + starter-challenge picker; calls `markOnboarded()` then `router.dismissTo('/')`.
- `app/settings.tsx` — sound toggle and per-habit daily reminder scheduling.
- Typed routes and the React Compiler are both enabled (`app.json` → `experiments`).

**State — `hooks/use-habits.ts` (the core of the app):**
Three module-level values (`habits`, `challenges`, `settings`), each exposed through its own `useSyncExternalStore` store (`useHabits`, `useChallenges`, `useSettings`) so every screen shares one source of truth with no provider. All mutations reassign the relevant array/object and call `emit()`, which clones the arrays for fresh references, notifies listeners, and schedules a persist.

- **Habits** carry a `kind` (`'check'` | `'count'`), a `target` (always 1 for checks), and a per-day `log: Record<'YYYY-MM-DD', number>` of progress. A day is complete once `log[iso] >= target` (`isDayComplete`). `currentStreak`, `completedDates`, `lastNDays`, and `todayProgress` derive everything else from the log. `tickToday` is the central mutation: checks toggle 0↔1, counts increment toward target (tapping a finished count resets it), and it returns `{ completed, finishedChallenges }` so the caller fires the reward **exactly once** on the crossing tap.
- **Challenges** are time-boxed goals (`lengthDays`, `startDate`, `progressDates`, `status`). Completing a qualifying habit calls `recordChallengeProgress`, which advances active challenges and flips them to `completed` when the goal is met; the just-completed ones bubble up so the UI can celebrate. `habitId: null` means any habit counts.
- **Settings** holds `soundEnabled` and the `onboarded` flag.

**Persistence (`@react-native-async-storage/async-storage`):** state hydrates once at module load (`hydrate()`), and writes are debounced (`schedulePersist`, 250ms). Writes are **gated behind `didHydrate`** so the seed data can never clobber stored data on a cold start — `emit()` only persists once hydration has finished. The stored blob carries a `schemaVersion` (currently `2`); `migrate()` upgrades older shapes forward (notably v1's `completedDates: string[]` → the per-day `log`). Bump `SCHEMA_VERSION` and extend `migrate()` when you change the persisted shape.

**Dev-only test helpers:** `devResetChallenge`, `devAdjustChallengeDay`, and `latestTestableChallenge` exist to drive the full challenge arc (advance → complete → celebrate) without waiting real calendar days. They synthesize/clear progress dates **and mirror them onto every habit's log** so History, streaks, and the chart stay consistent. The Today screen exposes these behind `__DEV__` (and keeps the banner visible after completion in dev).

**Reward & retention subsystems:**
- `hooks/use-reward.ts` — `useReward()` returns `fireReward()`: a success haptic plus a chime via `expo-audio` (when `soundEnabled`). The chime is a committed asset generated by `scripts/generate-chime.js` — `require('@/assets/sounds/chime.wav')` throws at bundle time if it's missing, so keep it generated. The **visual** burst is separate: the caller bumps a counter into `<RewardBurst trigger={...} />`.
- `hooks/use-notifications.ts` — local (not remote) daily reminders via `expo-notifications`. `scheduleHabitReminder` returns the notification id, which is stored on the habit's `reminder.notificationId` so it can be cancelled/rescheduled.

**Theming & platform files:**
- Colors live in `constants/theme.ts`. Components consume them through `hooks/use-theme-color.ts` (`useThemeColor({ light, dark }, colorName)`), which resolves against the active color scheme — prefer this over hardcoding colors. The base palette is small (`text`, `background`, `tint`, `icon`, …); the screens supply their own light/dark color pairs for card surfaces, muted text, danger, etc. via `useThemeColor`'s override args.
- `ThemedText` / `ThemedView` are the shared primitives; `ThemedText` only supports the types `default | defaultSemiBold | title | subtitle | link` (no `small`/`code`/`themeColor` props).
- Platform-specific implementations use Metro's suffix resolution rather than `Platform.OS` branching for whole-module differences: e.g. `hooks/use-color-scheme.web.ts`, `hooks/use-notifications.web.ts`, `hooks/use-reward.web.ts`, and `components/ui/icon-symbol.ios.tsx` each override the base file on that platform. Match this pattern — when you add native behavior web can't do, add a `.web.ts(x)` sibling.

**Spacing convention:** screens define a local `const S = { ... }` step scale (multiples of 4) and reference `S.one`/`S.two`/… in styles rather than raw pixel numbers. Follow the existing scale in the file you're editing.

**Path alias:** `@/*` maps to the repo root (`tsconfig.json`), e.g. `@/components/themed-text`, `@/hooks/use-habits`.
