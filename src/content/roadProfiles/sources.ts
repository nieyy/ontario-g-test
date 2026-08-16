import type { RoadSourceRecord } from './types'

export const newmarketRoadSources: RoadSourceRecord[] = [
  {
    id: 'drivetest-newmarket-centre',
    kind: 'verified-context',
    sourceUrl: 'https://drivetest.ca/find-a-drivetest-centre/alphabetical_list/',
    observedAt: '2026-08-16',
    supports: ['Newmarket DriveTest Centre name', '320 Harry Walker Parkway S address'],
    notes: 'Public centre context only; it does not identify an official examination route.',
  },
  {
    id: 'town-newmarket-road-context',
    kind: 'verified-context',
    sourceUrl: 'https://www.newmarket.ca/resident-services/by-law-enforcement/restricted-area-driving-instructors-driving-schools',
    observedAt: '2026-08-16',
    supports: ['Newmarket road-name and area context'],
    notes: 'Road names provide regional vocabulary only; no geometry, lane count, speed or route order is copied.',
  },
  {
    id: 'newmarket-authored-road-grammar',
    kind: 'authored-approximation',
    observedAt: '2026-08-16',
    supports: ['All route order, geometry, lanes, intersections, speeds, ramps and exits'],
    notes: 'Hand-authored teaching geometry for G-test skill practice; not an official, recorded or predicted route.',
  },
]
