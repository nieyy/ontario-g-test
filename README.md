# Ontario G Test Practice

Interactive Ontario G road test practice with examiner instructions,
location-based road scenarios, and mistake reviews.

The project focuses on the observation and decisions tested during an Ontario G
road test. It is not a vehicle-physics simulator and does not reproduce or
guarantee an official DriveTest route.

## Current status

The project is in early development. Newmarket is the first planned test-centre
content pack, based around the road structures near 320 Harry Walker Parkway S.
Other Ontario centres can be added after their road content is verified.

## Local development

Requirements: Node.js 24 and npm.

```bash
npm install
npm run dev
```

Run all project checks:

```bash
npm run check
```

Create and preview a production build:

```bash
npm run build
npm run preview
```

## Deployment

Pushes to `main` are checked, built, and deployed through GitHub Actions. Vite
uses the `/ontario-g-test/` base path for the GitHub Pages project site:

<https://nieyy.github.io/ontario-g-test/>

## Privacy and independence

The MVP does not use analytics, accounts, paid map APIs, or remote driving-history
storage. This is an independent practice project and is not affiliated with
DriveTest or the Ontario Ministry of Transportation.

## License

[MIT](LICENSE)
