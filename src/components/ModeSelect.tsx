export function ModeSelect({ exam, practice, back, practiceEnabled }: { exam: () => void; practice: () => void; back: () => void; practiceEnabled: boolean }) {
  return (
    <main id="main-content" className="page-shell">
      <p className="eyebrow">Step 2 of 3</p>
      <h1>Choose how you want to train</h1>
      <p className="page-intro">Exam mode tests recall without coaching. Guided Practice uses the same road engine and scoring, with visible steps and feedback.</p>
      <div className="mode-grid">
        <article className="mode-card">
          <span className="pill">No prompts</span>
          <h2>Exam mode</h2>
          <p>Run the full Newmarket route with examiner instructions only. Dangerous findings pause the exam portion.</p>
          <ul><li>About 16 minutes</li><li>No Coach or highlighted controls</li><li>Best for checking readiness</li></ul>
          <button className="primary" onClick={exam}>Choose Exam mode</button>
        </article>
        {practiceEnabled && <article className="mode-card recommended">
          <span className="pill playable">Recommended for learning</span>
          <h2>Guided Practice</h2>
          <p>Follow short Prepare, Act, and Feedback steps without changing the road, controls, or scoring facts.</p>
          <ul><li>Full route or one typical scene</li><li>Mirror → Signal → Shoulder coaching</li><li>Retry the same situation</li></ul>
          <button className="primary" onClick={practice}>Choose Guided Practice</button>
        </article>}
      </div>
      <button className="secondary" onClick={back}>Back to centres</button>
    </main>
  )
}
