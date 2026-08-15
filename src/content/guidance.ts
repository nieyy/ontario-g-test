import type { ActionType, GuidancePlan, GuidanceStep, ScenarioType } from './types'

const opposite = (action: ActionType): ActionType[] => {
  const pairs: Partial<Record<ActionType, ActionType>> = {
    'mirror-left': 'mirror-right',
    'mirror-right': 'mirror-left',
    'signal-left': 'signal-right',
    'signal-right': 'signal-left',
    'shoulder-left': 'shoulder-right',
    'shoulder-right': 'shoulder-left',
    'lane-left': 'lane-right',
    'lane-right': 'lane-left',
    'turn-left': 'turn-right',
    'turn-right': 'turn-left',
  }
  return pairs[action] ? [pairs[action]!] : []
}

const actionStep = (
  id: string,
  action: ActionType,
  titleEn: string,
  instructionEn: string,
  titleZh: string,
  instructionZh: string,
  phase: GuidanceStep['phase'] = 'act',
): GuidanceStep => ({
  id,
  phase,
  titleEn,
  titleZh,
  instructionEn,
  instructionZh,
  highlightedAction: action,
  startsWhen: [],
  completeWhen: { kind: 'action', action },
  oppositeActions: opposite(action),
  correctiveFeedbackEn: `Use ${titleEn.toLowerCase()} before committing to the manoeuvre.`,
  correctiveFeedbackZh: `完成“${titleZh}”后再继续操作。`,
})

const mss = (direction: 'left' | 'right'): GuidanceStep[] => {
  const side = direction === 'left' ? 'Left' : 'Right'
  const zh = direction === 'left' ? '左侧' : '右侧'
  return [
    actionStep(`${direction}-mirror`, `mirror-${direction}`, `${side} mirror`, `Check the ${direction} mirror and traffic behind.`, `${zh}后视镜`, `观察${zh}后方交通。`, 'prepare'),
    actionStep(`${direction}-signal`, `signal-${direction}`, `${side} signal`, `Signal ${direction} early and clearly.`, `${zh}转向灯`, `提前、清楚地打${zh}转向灯。`),
    actionStep(`${direction}-shoulder`, `shoulder-${direction}`, `${side} shoulder`, `Check the ${direction} blind spot before moving.`, `${zh}盲区`, `移动前检查${zh}盲区。`),
  ]
}

const plan = (
  id: string,
  scenarioType: ScenarioType,
  variantIds: string[],
  steps: GuidanceStep[],
): GuidancePlan => ({
  id,
  version: 1,
  scenarioType,
  variantIds,
  steps,
  commonMistakes: [{
    id: `${id}-sequence`,
    messageEn: 'Keep the observation, signal, position, speed, and decision sequence visible.',
    messageZh: '让观察、打灯、位置、速度和决策的顺序清楚可见。',
  }],
})

export const guidancePlans: GuidancePlan[] = [
  plan('right-on-red-v1', 'right-on-red', ['right-on-red-1', 'right-on-red-2', 'right-on-red-3'], [
    ...mss('right'),
    actionStep('right-position', 'lane-right', 'Move right', 'Move one lane right into the correct turning position.', '进入右侧车道', '向右移动一个车道，进入正确转弯位置。'),
    actionStep('right-brake', 'brake', 'Progressive brake', 'Brake progressively and make a complete stop at the red light.', '渐进制动', '平稳减速，并在红灯前完全停车。'),
    actionStep('right-turn', 'turn-right', 'Turn when safe', 'When the turn control appears and the way is safe, turn right.', '确认安全后右转', '右转操作出现并确认安全后右转。', 'confirm'),
  ]),
  plan('yellow-stop-v1', 'yellow-light', ['yellow-light-1', 'yellow-light-3'], [
    actionStep('yellow-mirror', 'mirror-right', 'Rear-view check', 'Check behind before changing speed.', '观察后方', '改变速度前先观察后方。', 'prepare'),
    actionStep('yellow-brake', 'brake', 'Controlled stop', 'The authored situation allows a safe stop. Brake smoothly.', '平稳停车', '当前教学场景允许安全停车，请平稳制动。'),
  ]),
  plan('yellow-continue-v1', 'yellow-light', ['yellow-light-2'], [
    actionStep('yellow-mirror', 'mirror-right', 'Rear-view check', 'Check behind while keeping the car predictable.', '观察后方', '保持车辆动作可预测，同时观察后方。', 'prepare'),
    actionStep('yellow-continue', 'accelerate', 'Maintain progress', 'The authored situation is beyond the safe stopping point. Continue predictably.', '稳定通过', '当前教学场景已超过安全停车点，请稳定通过。'),
  ]),
  plan('multilane-left-v1', 'multilane-left', ['multilane-left-1', 'multilane-left-2', 'multilane-left-3'], [
    ...mss('left'),
    actionStep('left-position', 'lane-left', 'Move left', 'Move one lane left into the left-turn position.', '进入左侧车道', '向左移动一个车道，进入左转位置。'),
    actionStep('left-speed', 'brake', 'Adjust speed', 'Reduce speed progressively before the turn.', '调整速度', '转弯前平稳降低速度。'),
    actionStep('left-turn', 'turn-left', 'Turn left', 'When the turn control appears, complete the left turn.', '左转', '左转操作出现后完成左转。', 'confirm'),
  ]),
  plan('freeway-merge-v1', 'freeway-merge', ['freeway-merge-1', 'freeway-merge-2', 'freeway-merge-3'], [
    ...mss('left'),
    actionStep('merge-speed', 'accelerate', 'Match traffic speed', 'Build speed smoothly toward the authored traffic flow.', '匹配车流速度', '平稳加速，接近教学场景中的主线车流速度。'),
    actionStep('merge-left', 'lane-left', 'Merge left', 'Move one lane left when the merge control is available.', '向左汇入', '可以变道时向左移动一个车道。'),
  ]),
  plan('slow-lead-stay-v1', 'slow-lead', ['slow-lead-1', 'slow-lead-3'], [
    actionStep('slow-mirror', 'mirror-left', 'Assess behind', 'Check the left mirror while maintaining space behind the lead vehicle.', '观察后方', '与前车保持空间，同时观察左侧后方。', 'prepare'),
    actionStep('slow-brake', 'brake', 'Maintain space', 'Use a light brake input if needed; do not change lanes automatically.', '保持空间', '需要时轻点刹车，不要因为前车较慢就自动变道。'),
  ]),
  plan('slow-lead-change-v1', 'slow-lead', ['slow-lead-2'], [
    ...mss('left'),
    actionStep('slow-move-left', 'lane-left', 'Change lane', 'The authored gap is available; move one lane left.', '向左变道', '当前教学场景提供了可用空间，请向左移动一个车道。'),
  ]),
  plan('freeway-exit-v1', 'freeway-exit', ['freeway-exit-1', 'freeway-exit-2', 'freeway-exit-3'], [
    ...mss('right'),
    actionStep('exit-right', 'lane-right', 'Enter the exit lane', 'Move one lane right into the exit lane.', '进入出口车道', '向右移动一个车道，进入出口车道。'),
    actionStep('exit-brake', 'brake', 'Reduce speed on the exit', 'After entering the exit lane, brake progressively.', '出口减速', '进入出口车道后再平稳减速。'),
  ]),
]

const planByVariant = new Map(guidancePlans.flatMap((item) => item.variantIds.map((variantId) => [variantId, item] as const)))

export function getGuidancePlan(variantId: string): GuidancePlan | undefined {
  return planByVariant.get(variantId)
}
