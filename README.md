# Ontario G Practice

A static, first-person interactive study game for Ontario G road-test preparation. Version 1.1 ships Exam mode plus coached full-route and focused Guided Practice for the Newmarket content pack.

Play it at <https://nieyy.github.io/ontario-g-test/>.

## What is included

- Newmarket centre selection with a clear evidence and route disclaimer
- Three authored variants for each of six scenario families: right on red, yellow-light decisions, multi-lane left turns, freeway merging, slow lead vehicles, and freeway exits
- Exam mode with no teaching prompts, and Guided Practice with controlled Mirror–Signal–Shoulder coaching
- Full-route Guided Practice or focused scenario rounds with same-situation and next-variation retry
- Mouse, touch, and keyboard input (`WASD`/arrows, `Z`/`C` signals, `Q`/`E` mirrors, `Shift+Q`/`Shift+E` shoulder checks; `,`/`.` remain signal aliases)
- Browser `en-CA` speech with optional Chinese subtitles
- A fixed-step, seeded TypeScript simulation independent from React and SVG rendering
- Dangerous-event pause with an explicit “end” or “continue as practice” choice
- Situation–action–impact–improvement report, five learning dimensions, event timeline, and recent-attempt weakness suggestion
- IndexedDB history and local preferences; no account, analytics, paid API, backend, or data upload

This is an independent training tool. It is not affiliated with DriveTest or the Government of Ontario. The scenes are authored approximations, not official, recorded, or predicted test routes, and reports are not official scores or pass predictions.

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

The Newmarket address and available G service are linked to the official DriveTest centre listing. All simulated road geometry, traffic events, speeds, examiner situations, and guidance in 1.1 are deliberately labelled as authored teaching content.

## Deployment

The GitHub Actions workflow verifies content, lint, unit tests, builds, Chromium/WebKit E2E tests, and accessibility checks before deploying `dist` to GitHub Pages from `main`. Vite uses the project-site base path `/ontario-g-test/`.

## License

[MIT](LICENSE)
