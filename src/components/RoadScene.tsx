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
  'lane-left': 'Left lane selected',
  'lane-right': 'Right lane selected',
}

export function RoadScene({ scenario, speedKph, lane, signal, recentAction, scenarioElapsed, reducedMotion }: Props) {
  const phase = reducedMotion ? 0 : (scenarioElapsed * Math.max(speedKph, 8)) % 120
  const isFreeway = scenario.environment === 'freeway'
  const leadY = 235 + Math.sin(scenarioElapsed / 5) * 8
  const label = `First-person ${scenario.environment} road scene for ${scenario.title}. Current speed ${Math.round(speedKph)} kilometres per hour.`
  const feedbackLabel = recentAction === 'signal-left'
    ? `Left signal ${signal === 'left' ? 'on' : 'off'}`
    : recentAction === 'signal-right'
      ? `Right signal ${signal === 'right' ? 'on' : 'off'}`
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
          <g aria-hidden="true">
            <rect x="576" y="92" width="10" height="164" fill="#333b40" />
            <rect x="548" y="85" width="66" height="116" rx="9" fill="#22292e" />
            {(['red', 'yellow', 'green'] as const).map((colour, index) => (
              <circle
                key={colour}
                cx="581"
                cy={112 + index * 33}
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
      <div className="lane-indicator" aria-label="Current lane" aria-live="polite">Lane: <strong>{lane === -1 ? 'Left' : lane === 1 ? 'Right' : 'Centre'}</strong></div>
      {recentAction && feedbackLabel && (
        <div className={`action-feedback feedback-${recentAction}`} role="status">
          <span>{recentAction.includes('left') ? '←' : '→'}</span>{feedbackLabel}
        </div>
      )}
    </div>
  )
}
