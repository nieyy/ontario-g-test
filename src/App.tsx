import { centres } from './domain/centres'

function App() {
  const centre = centres.find(({ supportStatus }) => supportStatus === 'available')

  if (!centre) {
    return <main className="shell">No practice centres are available yet.</main>
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">ONTARIO G TEST PRACTICE</p>
        <h1>Practise the decisions,<br />not a memorized route.</h1>
        <p className="intro">
          Interactive examiner instructions, location-based road situations,
          and a clear review of every important decision.
        </p>
      </header>

      <section className="centre-section" aria-labelledby="centre-heading">
        <div className="section-heading">
          <div>
            <p className="step">STEP 01</p>
            <h2 id="centre-heading">Choose a test centre</h2>
          </div>
          <span className="status">Early development</span>
        </div>

        <article className="centre-card">
          <div className="centre-copy">
            <span className="available">Available first</span>
            <h3>{centre.name}</h3>
            <p className="address">{centre.address}</p>
            <ul>
              {centre.roadFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
          <button type="button" disabled aria-describedby="coming-soon">
            Start practice
          </button>
        </article>

        <p id="coming-soon" className="coming-soon">
          The interactive practice is being designed. More Ontario test centres
          will be added after their road content is verified.
        </p>
      </section>

      <footer>
        Independent practice tool. Not affiliated with DriveTest or the Ontario
        Ministry of Transportation. It does not reproduce or guarantee an
        official test route.
      </footer>
    </main>
  )
}

export default App
