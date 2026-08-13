import type { ActionType, ScenarioVariant } from '../content/types'

type Props = {
  scenario: ScenarioVariant
  speedKph: number
  lane: -1 | 0 | 1
  signal: 'left' | 'right' | null
  recentAction: ActionType | null
  scenarioElapsed: number
  reducedMotion: boolean
}

const feedbackLabels: Partial<Record<ActionType, string>> = {
  'mirror-left': 'Left mirror checked',
  'mirror-right': 'Right mirror checked',
  'shoulder-left': 'Left shoulder checked',
  'shoulder-right': 'Right shoulder checked',
}

export function RoadScene({ scenario, speedKph, lane, signal, recentAction, scenarioElapsed, reducedMotion }: Props) {
  const phase = reducedMotion ? 0 : (scenarioElapsed * Math.max(speedKph, 8)) % 120
  const isFreeway = scenario.environment === 'freeway'
  const hasIntersection = ['right-on-red', 'yellow-light', 'multilane-left'].includes(scenario.type)
  const approachProgress = hasIntersection
    ? Math.min(0.9, scenarioElapsed / (scenario.durationSeconds * 0.75))
    : 0
  const intersectionY = 260 + approachProgress * 160
  const intersectionHeight = 22 + approachProgress * 84
  const stopLineY = intersectionY + intersectionHeight / 2 + 9
  const roadPerspective = Math.max(0, (stopLineY - 248) / 292)
  const stopLineLeft = 365 - roadPerspective * 365
  const stopLineRight = 595 + roadPerspective * 365
  const intersectionStage = approachProgress >= 0.72 ? 'Decision zone' : approachProgress >= 0.32 ? 'Intersection approaching' : 'Intersection ahead'
  const leadY = 235 + Math.sin(scenarioElapsed / 5) * 8
  const label = `First-person ${scenario.environment} road scene for ${scenario.title}. ${hasIntersection ? `${intersectionStage}. ` : ''}Current speed ${Math.round(speedKph)} kilometres per hour.`
  const laneName = lane === -1 ? 'Left' : lane === 1 ? 'Right' : 'Centre'
  const feedbackLabel = recentAction === 'signal-left'
    ? `Left signal ${signal === 'left' ? 'on' : 'off'}`
    : recentAction === 'signal-right'
      ? `Right signal ${signal === 'right' ? 'on' : 'off'}`
      : recentAction === 'lane-left'
        ? `Moved one lane left — now in ${laneName} lane`
        : recentAction === 'lane-right'
          ? `Moved one lane right — now in ${laneName} lane`
          : recentAction
        ? feedbackLabels[recentAction]
        : undefined

  return (
    <div className="road-frame">
      <svg className="road-scene" viewBox="0 0 960 540" role="img" aria-label={label}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#88c9f4" />
            <stop offset="1" stopColor="#eaf5fb" />
          </linearGradient>
          <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4c5359" />
            <stop offset="1" stopColor="#1f2529" />
          </linearGradient>
        </defs>

        <g className={reducedMotion ? 'road-world' : 'road-world road-world-animated'} style={{ transform: `translateX(${-lane * 90}px)` }}>
        <rect x="-120" width="1200" height="540" fill="url(#sky)" />
        <path d="M0 252 H960 V340 L0 324Z" fill={isFreeway ? '#678a56' : '#779861'} />
        {!isFreeway && (
          <g aria-hidden="true">
            <rect x="38" y="192" width="150" height="92" fill="#ddd7cb" />
            <rect x="61" y="215" width="34" height="35" fill="#7ab2d4" />
            <rect x="790" y="177" width="125" height="108" fill="#e1c8ad" />
            <rect x="823" y="205" width="42" height="38" fill="#78a8c2" />
            <circle cx="242" cy="218" r="42" fill="#4a783f" />
            <circle cx="728" cy="220" r="50" fill="#4d7a42" />
          </g>
        )}
        {isFreeway && (
          <g aria-hidden="true">
            <rect x="704" y="126" width="180" height="72" rx="5" fill="#1e6b47" stroke="white" strokeWidth="4" />
            <text x="794" y="155" textAnchor="middle" fill="white" fontSize="22" fontWeight="700">Newmarket</text>
            <text x="794" y="181" textAnchor="middle" fill="white" fontSize="17">Next exit</text>
            <rect x="790" y="198" width="8" height="75" fill="#7d8589" />
          </g>
        )}

        <path d="M365 248 L595 248 L960 540 L0 540Z" fill="url(#road)" />
        <path d="M365 248 L0 540" stroke="#f4f1df" strokeWidth="8" />
        <path d="M595 248 L960 540" stroke="#f4f1df" strokeWidth="8" />
        {[-120, 0, 120, 240, 360, 480].map((offset) => {
          const y = 255 + ((offset + phase) % 600)
          const perspective = Math.max(0, (y - 245) / 295)
          return (
            <g key={offset} opacity={perspective > 0 ? 1 : 0}>
              <path
                d={`M${442 - perspective * 92} ${y} L${442 - perspective * 92 - perspective * 8} ${y + 30 + perspective * 35}`}
                stroke="#f5f1d3"
                strokeWidth={2 + perspective * 7}
              />
              <path
                d={`M${518 + perspective * 92} ${y} L${518 + perspective * 92 + perspective * 8} ${y + 30 + perspective * 35}`}
                stroke="#f5f1d3"
                strokeWidth={2 + perspective * 7}
              />
            </g>
          )
        })}

        {hasIntersection && (
          <g data-testid="approaching-intersection" data-approach={approachProgress.toFixed(2)} aria-hidden="true">
            <rect x="-120" y={intersectionY - intersectionHeight / 2} width="1200" height={intersectionHeight} fill="#343c41" />
            <line x1="-120" y1={intersectionY - intersectionHeight / 2} x2="1080" y2={intersectionY - intersectionHeight / 2} stroke="#eee9d8" strokeWidth={4 + approachProgress * 5} />
            <line x1="-120" y1={intersectionY + intersectionHeight / 2} x2="1080" y2={intersectionY + intersectionHeight / 2} stroke="#eee9d8" strokeWidth={4 + approachProgress * 5} />
            {[0.18, 0.34, 0.5, 0.66, 0.82].map((position) => {
              const stripeX = stopLineLeft + (stopLineRight - stopLineLeft) * position
              const stripeWidth = Math.max(3, (stopLineRight - stopLineLeft) * 0.075)
              return <rect key={position} x={stripeX - stripeWidth / 2} y={stopLineY - 5} width={stripeWidth} height={6 + approachProgress * 7} fill="#f7f4e8" opacity=".92" />
            })}
            <line x1={stopLineLeft} y1={stopLineY + 12 + approachProgress * 4} x2={stopLineRight} y2={stopLineY + 12 + approachProgress * 4} stroke="white" strokeWidth={5 + approachProgress * 7} />
            <g transform={`translate(480 ${stopLineY + 42 + approachProgress * 26}) scale(${0.65 + approachProgress * 0.65})`} fill="none" stroke="#f3e887" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
              {scenario.type === 'right-on-red' && <path d="M0 25 V-12 Q0-30 20-30 H47 M34-44 L49-30 L34-16" />}
              {scenario.type === 'multilane-left' && <path d="M0 25 V-12 Q0-30-20-30 H-47 M-34-44 L-49-30 L-34-16" />}
              {scenario.type === 'yellow-light' && <path d="M0 27 V-34 M-15-18 L0-35 L15-18" />}
            </g>
          </g>
        )}

        {(scenario.type === 'slow-lead' || scenario.type === 'freeway-merge') && (
          <g transform={`translate(${lane * -22} ${leadY})`} aria-hidden="true">
            <path d="M430 0 h100 l22 48 H408Z" fill="#26333f" />
            <rect x="423" y="15" width="114" height="46" rx="10" fill="#b9c5cc" stroke="#18232b" strokeWidth="4" />
            <rect x="438" y="23" width="34" height="21" fill="#75a0ba" />
            <rect x="488" y="23" width="34" height="21" fill="#75a0ba" />
            <circle cx="441" cy="61" r="10" fill="#171b1e" />
            <circle cx="519" cy="61" r="10" fill="#171b1e" />
          </g>
        )}

        {scenario.trafficLight && (
          <g aria-hidden="true" transform={`translate(${548 + approachProgress * 86} ${85 + approachProgress * 48}) scale(${0.7 + approachProgress * 0.5})`}>
            <rect x="28" y="7" width="10" height="164" fill="#333b40" />
            <rect width="66" height="116" rx="9" fill="#22292e" />
            {(['red', 'yellow', 'green'] as const).map((colour, index) => (
              <circle
                key={colour}
                cx="33"
                cy={27 + index * 33}
                r="12"
                fill={scenario.trafficLight === colour ? ({ red: '#ef4e43', yellow: '#ffd041', green: '#42cc75' }[colour]) : '#4b5358'}
              />
            ))}
          </g>
        )}
        </g>

        <g transform={`rotate(${lane * 12} 480 489)`}>
        <path d="M172 540 C240 422 335 386 480 386 C625 386 720 422 788 540Z" fill="#172129" />
        <path d="M338 540 C355 459 398 423 480 423 C562 423 605 459 622 540Z" fill="#0b1014" stroke="#34444e" strokeWidth="8" />
        <circle cx="480" cy="489" r="43" fill="#25333d" stroke="#52636d" strokeWidth="9" />
        </g>

        {signal && (
          <g transform={signal === 'left' ? 'translate(245 468)' : 'translate(675 468)'}>
            <path d={signal === 'left' ? 'M40 0 L0 22 L40 44 V31 H74 V13 H40Z' : 'M34 0 L74 22 L34 44 V31 H0 V13 H34Z'} fill="#62d584" />
          </g>
        )}
      </svg>
      <div className={`mirror mirror-left ${recentAction === 'mirror-left' ? 'mirror-checked' : ''}`} aria-hidden="true"><b>LEFT MIRROR</b><span /></div>
      <div className={`mirror mirror-right ${recentAction === 'mirror-right' ? 'mirror-checked' : ''}`} aria-hidden="true"><b>RIGHT MIRROR</b><span /></div>
      <div className="lane-indicator" aria-label="Current lane" aria-live="polite">
        {(['Left', 'Centre', 'Right'] as const).map((name, index) => (
          <span key={name} className={lane === index - 1 ? 'current' : ''}><i aria-hidden="true">▲</i>{name}</span>
        ))}
      </div>
      {hasIntersection && <div className={`scene-event ${approachProgress >= 0.72 ? 'decision' : ''}`} aria-live="polite"><strong>{intersectionStage}</strong><span>{approachProgress >= 0.72 ? 'Scan · choose · act' : 'Watch the signal and road markings'}</span></div>}
      {recentAction && feedbackLabel && (
        <div className={`action-feedback feedback-${recentAction}`} role="status">
          <span>{recentAction.includes('left') ? '←' : '→'}</span>{feedbackLabel}
        </div>
      )}
    </div>
  )
}
