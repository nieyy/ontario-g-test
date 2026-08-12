# Agent Rules

This repository contains the Ontario G Test interactive practice web app.

## Product boundaries

- Treat this as an independent training tool, not an official DriveTest product.
- Never describe a simulated route as an official or guaranteed test route.
- Optimize for observation and decision practice, not realistic vehicle physics.
- Keep the MVP static-hostable on GitHub Pages with no paid map APIs or backend.
- Do not collect analytics, personal information, or driving history remotely.
- Keep centre-specific routes and assets bound to a `centreId`; reusable driving
  rules may be shared across centres.

## Engineering rules

- Use TypeScript for application and domain logic.
- Keep scoring and scenario rules deterministic and independently testable.
- Preserve keyboard, pointer, touch, reduced-motion, and text alternatives.
- Do not commit secrets, API keys, generated `dist/`, coverage, or dependencies.
- Run `npm run check` and `git diff --check` before proposing a commit.
