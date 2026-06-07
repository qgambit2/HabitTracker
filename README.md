# HabitTracker

A small habit-tracker built with [Expo](https://expo.dev) (React Native), running on iOS, Android, and web from one codebase. Track daily habits — either simple check-offs or counted targets — keep streaks alive, run time-boxed challenges, and get a little multi-sensory reward (haptic + chime + visual burst) every time you complete one.

## Features

- **Two habit kinds** — *check* (once a day) or *count* (hit a per-day target, e.g. 8 glasses of water).
- **Streaks & history** — current consecutive-day streaks, a 7/30-day consistency chart, and a newest-first completion timeline.
- **Challenges** — time-boxed goals (e.g. a 7-day streak) that advance as you complete habits and celebrate on completion.
- **Daily reminders** — per-habit local notifications.
- **Reward feedback** — success haptic, a generated chime, and an on-screen burst on each completion.
- **Light/dark theming** and **persistence** across reloads (AsyncStorage), with a schema-migration path.

## Requirements

This project is **pinned to Expo SDK 54** on purpose — the owner tests on-device via the App Store build of Expo Go, which only supports SDK 54. Don't bump `expo` / `expo-*` / `react-native` / `react` without switching the device-testing story to a [development build](https://docs.expo.dev/develop/development-builds/introduction/). See [`CLAUDE.md`](./CLAUDE.md) for the full rationale.

- Node.js (LTS)
- [Expo Go](https://expo.dev/go) on a device (SDK 54), or an iOS Simulator / Android Emulator

## Getting started

```bash
npm install      # install dependencies
npx expo start   # start Metro; scan the QR with Expo Go, or press i / a / w
```

Or jump straight to a platform:

```bash
npm run ios       # iOS simulator
npm run android   # Android emulator
npm run web       # web build
```

## Project layout

```
app/                 # Expo Router file-based routes
  (tabs)/
    index.tsx        # Today  — habit list, add-habit, challenge banner, reward
    explore.tsx      # Progress — consistency chart + completion grid
    history.tsx      # History — completed-day timeline
  onboarding.tsx     # first-launch welcome + starter challenge
  settings.tsx       # sound toggle, per-habit reminders
  modal.tsx          # celebration modal
hooks/
  use-habits.ts      # the core store: habits, challenges, settings + persistence
  use-reward.ts      # haptic + chime payoff
  use-notifications.ts
constants/theme.ts   # color palette
components/          # ThemedText/ThemedView + UI pieces
```

State lives in `hooks/use-habits.ts`: module-level stores exposed via `useSyncExternalStore` (no provider), persisted to AsyncStorage. See [`CLAUDE.md`](./CLAUDE.md) for the architecture in depth.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npx tsc --noEmit` | TypeScript type-check (strict) |
| `npx expo-doctor` | Validate dependencies against the SDK |
| `node scripts/generate-chime.js` | Regenerate the committed reward chime asset |

> There is **no test framework** configured — verify changes with `tsc`, `expo-doctor`, and by running the app.
