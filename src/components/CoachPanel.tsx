import type { CoachFrame } from '../content/types'

export function CoachPanel({ frame }: { frame: CoachFrame }) {
  const current = frame.visibleSteps.find((step) => step.state === 'current')
  return (
    <section className="coach-panel" aria-label="Guided practice coach" data-highlight-action={current?.highlightedAction ?? ''}>
      <div className="coach-heading">
        <div><span className="coach-mark">COACH</span><strong>{current?.title ?? 'Scene routine complete'}</strong></div>
        <span>{frame.progress.completed}/{frame.progress.total}</span>
      </div>
      {current?.instruction && <p>{current.instruction}</p>}
      {current?.keyLabel && <div className="coach-action"><span>Do this now</span><kbd>{current.keyLabel}</kbd></div>}
      <ol className="coach-steps">
        {frame.visibleSteps.map((step) => <li key={step.id} className={step.state}><span>{step.state === 'done' ? '✓' : step.state === 'missed' ? '!' : '•'}</span>{step.title}</li>)}
      </ol>
      <div className="coach-live" aria-live="polite" aria-atomic="true">
        {frame.feedback && <p className={`coach-feedback ${frame.feedback.tone}`}>{frame.feedback.messageEn}</p>}
      </div>
    </section>
  )
}
