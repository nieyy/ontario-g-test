# Release notes

## 1.3.0 — 2026-08-17

- Replaced the legacy 2D Canvas driving view with one React Three Fiber/Three.js low-poly renderer; there is no runtime Canvas fallback.
- Added deterministic route-scene and render-snapshot contracts so road geometry, markings, signals, traffic, camera, scoring, coaching, and the mini-map share the same simulation state.
- Added procedural Newmarket-inspired roadside context, cockpit and mirror framing, scripted traffic, lighting, fog, and device-aware quality tiers without Street View, map SDKs, or remote 3D assets.
- Added recoverable WebGL 2 capability/context-loss handling that preserves and pauses the current attempt.
- Added 3D content validation, asset-policy checks, bundle budgets, renderer metrics, unit coverage, and Chromium/WebKit WebGL release tests.

## 1.2.0 — 2026-08-16

- Added the versioned `newmarket-road-profile-v1` authored teaching corridor.
- Replaced the production fixed three-lane road with dynamic one-, two-, three-, turn-pocket, merge, and exit lane structures.
- Made `RoadPosition` and stable `laneId` the source for Canvas, controls, coaching facts, checkpoint state, and the route mini-map.
- Anchored road surfaces, lane markings, arrows, stop lines, intersections, and signals in one RoadFrame coordinate system.
- Added checkpoint schema v3 with conservative v2 migration and a one-release 1.1 rollback path.
- Added strict road-content validation, geometry/engine/mini-map tests, and desktop/mobile visual E2E coverage.

This release remains an independent teaching tool. It does not contain an official, recorded, guaranteed, or predicted DriveTest route.
