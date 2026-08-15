import { scenarioLabels, scenarioOrder } from '../content/data'
import type { ScenarioType } from '../content/types'

const focus: Record<ScenarioType, string> = {
  'right-on-red': 'Complete stop, right MSS, position, and safe turn',
  'yellow-light': 'Choose a controlled stop or predictable continuation',
  'multilane-left': 'Left MSS, lane position, speed, and turn timing',
  'freeway-merge': 'Observation, speed matching, and merge position',
  'slow-lead': 'Following space and evidence-based lane decisions',
  'freeway-exit': 'Early right MSS, exit position, then progressive braking',
}

export function PracticeSelect({ fullRoute, scenario, back, suggested, source }: {
  fullRoute: () => void
  scenario: (type: ScenarioType) => void
  back: () => void
  suggested?: ScenarioType
  source?: 'exam' | 'practice'
}) {
  return (
    <main id="main-content" className="page-shell">
      <p className="eyebrow">Step 3 of 3</p>
      <h1>Choose a Guided Practice session</h1>
      <p className="page-intro">Use the complete route for continuity, or repeat one typical situation until the routine feels automatic.</p>
      <button className="full-practice-card" onClick={fullRoute}>
        <span><b>FULL ROUTE</b><strong>Practice the same six-scene route structure as Exam mode</strong><small>About 16 minutes · coaching stays on · non-blocking scene transitions</small></span>
        <i>Start full route →</i>
      </button>
      {suggested && <p className="practice-recommendation">Suggested: <strong>{scenarioLabels[suggested]}</strong> · Based on {source === 'exam' ? 'exam' : 'practice'} history</p>}
      <section className="scenario-grid" aria-label="Typical practice scenarios">
        {scenarioOrder.map((type) => (
          <article key={type} className={type === suggested ? 'suggested' : ''}>
            <div>{type === suggested && <span className="pill playable">Suggested</span>}<span className="pill">2–3 min</span></div>
            <h2>{scenarioLabels[type]}</h2>
            <p>{focus[type]}</p>
            <button className="secondary" onClick={() => scenario(type)}>Practice this scene</button>
          </article>
        ))}
      </section>
      <button className="secondary" onClick={back}>Back to mode choice</button>
    </main>
  )
}
