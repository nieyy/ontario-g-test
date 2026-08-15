import { scenarioLabels } from '../content/data'
import type { AttemptRecordV2 } from '../content/types'

export function PracticeRoundSummary({ attempt, retrySame, nextVariation, chooseAnother, review }: {
  attempt: AttemptRecordV2
  retrySame: () => void
  nextVariation: () => void
  chooseAnother: () => void
  review: () => void
}) {
  const scope = attempt.scope.kind === 'scenario' ? attempt.scope : undefined
  const issues = attempt.findings.filter((finding) => finding.severity !== 'good')
  return (
    <main id="main-content" className="page-shell round-summary">
      <p className="eyebrow">Guided Practice round complete</p>
      <h1>{scope ? scenarioLabels[scope.scenarioType] : 'Practice scene'} · Round {scope?.roundIndex ?? 1}</h1>
      <p className="page-intro">The completed round has been saved separately so retries never overwrite your earlier evidence.</p>
      <section className="report-summary">
        <div><strong>{attempt.guidanceSummary?.[0]?.completedStepIds.length ?? 0}</strong><span>Coach steps completed</span></div>
        <div><strong>{attempt.guidanceSummary?.[0]?.missedStepIds.length ?? 0}</strong><span>steps missed</span></div>
        <div><strong>{issues.length}</strong><span>practice findings</span></div>
      </section>
      <div className="round-actions">
        <button className="primary" onClick={retrySame}>Retry same situation</button>
        <button className="secondary" onClick={nextVariation}>Try next variation</button>
        <button className="secondary" onClick={chooseAnother}>Choose another scenario</button>
        <button className="text-button" onClick={review}>View detailed report</button>
      </div>
    </main>
  )
}
