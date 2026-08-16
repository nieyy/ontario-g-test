# Ontario G Practice

A static, first-person interactive study game for Ontario G road-test preparation. Version 1.2 adds a content-driven Newmarket-inspired teaching corridor to Exam mode, full-route Guided Practice, and focused scenario practice.

Play it at <https://nieyy.github.io/ontario-g-test/>.

## What is included

- Newmarket centre selection with a clear evidence and route disclaimer
- A deterministic authored corridor with parking departure, one-lane local road, two-lane arterial, visible left-turn pocket, traffic signals, curved freeway entrance, three-lane mainline, exit lane, and return context
- Stable road, edge, section, and lane IDs shared by the driving engine, Canvas scene, controls, coaching facts, scoring facts, checkpoint, and route mini-map
- Three authored variants for each of six scenario families: right on red, yellow-light decisions, multi-lane left turns, freeway merging, slow lead vehicles, and freeway exits
- Exam mode with no teaching prompts, and Guided Practice with controlled Mirror–Signal–Shoulder coaching
- Full-route Guided Practice or focused scenario rounds with same-situation and next-variation retry
- Mouse, touch, and keyboard input (`WASD`/arrows, `Z`/`C` signals, `Q`/`E` mirrors, `Shift+Q`/`Shift+E` shoulder checks; `,`/`.` remain signal aliases)
- Browser `en-CA` speech with optional Chinese subtitles
- A fixed-step, seeded TypeScript simulation and visible-range RoadFrame builder independent from React rendering
- Dangerous-event pause with an explicit “end” or “continue as practice” choice
- Situation–action–impact–improvement report, five learning dimensions, event timeline, and recent-attempt weakness suggestion
- IndexedDB checkpoint schema v3 with conservative v2 migration; completed history remains schema v2 and is never uploaded
- IndexedDB history and local preferences; no account, analytics, paid API, backend, map tile, or data upload

This is an independent training tool. It is not affiliated with DriveTest or the Government of Ontario. Public sources support the centre address and regional road-name context only. Every route order, lane layout, signal, speed parameter, ramp, exit, and road geometry is a hand-authored teaching approximation—not an official, recorded, guaranteed, or predicted test route. Reports are not official scores or pass predictions.

## Local development

Requires Node.js 24 and npm.

```bash
npm ci
npm run dev
```

Run the deterministic unit/integration checks and production build:

```bash
npm run check
```

Install browser engines once, then run desktop Chromium/WebKit, accessibility, full-flow, and mobile-control tests:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

The complete release gate is `npm run check:release`.

## Content contract

Centre, scenario, and controlled GuidancePlan content lives in `src/content`. Every centre has a stable ID, content version, publication state, evidence metadata, disclaimer, and three variants per scenario family. The content validator also proves that all 18 playable variants have exactly one guidance plan and enforces Mirror–Signal–Shoulder order. Run `npm run validate:content` after any content change.

The Newmarket address and available G service are linked to the official DriveTest centre listing. Town of Newmarket public material supports regional road-name context. `src/content/roadProfiles` contains the versioned profile, lightweight source ledger, topology validator, and all hand-authored geometry. Runtime code makes no map-service request.

The Pages workflow enables the v1 road profile with `VITE_NEWMARKET_ROAD_PROFILE_ENABLED=true`. Any other value retains the 1.1 fixed-road compatibility path for one rollback cycle.

## Deployment

The GitHub Actions workflow verifies content, lint, unit tests, an enabled production build, Chromium/WebKit E2E tests, checkpoint compatibility, and accessibility before deploying `dist` to GitHub Pages from `main`. Vite uses the project-site base path `/ontario-g-test/`.

## License

[MIT](LICENSE)
