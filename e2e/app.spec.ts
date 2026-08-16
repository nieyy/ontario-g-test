import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

async function openFocusedPractice(page: import('@playwright/test').Page, title: string, query = '') {
  await page.goto(query)
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Guided Practice' }).click()
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title }) })
  await card.getByRole('button', { name: 'Practice this scene' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByText('GUIDED PRACTICE', { exact: true })).toBeVisible()
}

test('completes an accelerated Newmarket drive and produces a review', async ({ page }) => {
  await page.goto('?debug=1&seed=17')
  await expect(page.getByRole('heading', { name: /Make the G-test routine visible/i })).toBeVisible()
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByText('G TEST PRACTICE', { exact: true })).toBeVisible()

  for (let index = 0; index < 7; index += 1) {
    const danger = page.getByRole('heading', { name: /The exam portion stops here|Review this dangerous moment/ })
    const review = page.getByRole('heading', { name: /Review the dangerous moments first|Practice drive complete/i })
    await expect(danger.or(review)).toBeVisible({ timeout: 20_000 })
    if (await review.isVisible()) break
    const continueExam = page.getByRole('button', { name: 'Continue as practice' })
    if (await continueExam.isVisible()) await continueExam.click()
    else await page.getByRole('button', { name: 'Continue from here' }).click()
  }

  await expect(page.getByRole('heading', { name: /Review the dangerous moments first/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Decision timeline' })).toBeVisible()
  await expect(page.getByText(/not an official score, result, or pass prediction/i)).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  expect((await download).suggestedFilename()).toMatch(/^ontario-g-test-attempt-.*\.json$/)
})

test('restores a version-compatible interrupted checkpoint after reload', async ({ page }) => {
  await page.goto('?debug=1&seed=29')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByText('G TEST PRACTICE', { exact: true })).toBeVisible()
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Resume interrupted drive' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume interrupted drive' }).click()
  await expect(page.getByText('G TEST PRACTICE', { exact: true })).toBeVisible()
})

test('holds speed after the keyboard accelerator is released', async ({ page }) => {
  await page.goto('?seed=31')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByText('HOLD', { exact: true })).toBeVisible()

  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(700)
  await page.keyboard.up('ArrowUp')
  const speedAfterRelease = Number(await page.locator('.speed-readout strong').innerText())
  expect(speedAfterRelease).toBeGreaterThan(0)

  await page.waitForTimeout(700)
  await expect(page.locator('.speed-readout strong')).toHaveText(String(speedAfterRelease))
})

test('distinguishes pedal taps from sustained acceleration and braking', async ({ page }) => {
  await page.goto('?seed=32')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  const speed = page.locator('.speed-readout strong')

  await page.keyboard.press('ArrowUp')
  await expect(speed).toHaveText('2')
  await page.waitForTimeout(500)
  await expect(speed).toHaveText('2')

  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(900)
  await page.keyboard.up('ArrowUp')
  const speedAfterHold = Number(await speed.innerText())
  expect(speedAfterHold).toBeGreaterThan(8)

  await page.keyboard.press('ArrowDown')
  const speedAfterTapBrake = Number(await speed.innerText())
  expect(speedAfterTapBrake).toBeGreaterThan(0)
  expect(speedAfterHold - speedAfterTapBrake).toBeGreaterThanOrEqual(2)
  expect(speedAfterHold - speedAfterTapBrake).toBeLessThanOrEqual(3)
  await page.waitForTimeout(500)
  await expect(speed).toHaveText(String(speedAfterTapBrake))

  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(700)
  await page.keyboard.up('ArrowDown')
  expect(Number(await speed.innerText())).toBeLessThan(speedAfterTapBrake)
})

test('approaches the instructed intersection only while the vehicle moves', async ({ page }) => {
  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=760&seed=43')

  const roadWorld = page.getByTestId('road-world')
  await expect(roadWorld).toBeVisible()
  await expect(roadWorld).toHaveAttribute('data-road-section', 'urban-signal-junction')
  const initialDistance = Number(await roadWorld.getAttribute('data-camera-z'))
  await page.waitForTimeout(600)
  const stoppedDistance = Number(await roadWorld.getAttribute('data-camera-z'))
  expect(stoppedDistance).toBe(initialDistance)

  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(700)
  const laterDistance = Number(await roadWorld.getAttribute('data-camera-z'))

  expect(laterDistance).toBeGreaterThan(stoppedDistance)
  await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'true')
  await expect(page.getByText(/Intersection ahead|Intersection approaching|Decision zone/)).toBeVisible()
})

test('drives across the intersection and leaves it behind', async ({ page }) => {
  await openFocusedPractice(page, 'Yellow-light decision', '?debug=1&timeScale=2&startDistance=248&seed=45')

  const roadWorld = page.getByTestId('road-world')
  await expect(roadWorld).toHaveAttribute('data-intersection-phase', 'crossing')
  await expect(page.getByText('Intersection is passing under the car')).toBeVisible()
  await page.keyboard.down('ArrowUp')
  await expect.poll(async () => roadWorld.getAttribute('data-intersection-phase'), { timeout: 6_000 }).toBe('passed')
  await page.keyboard.up('ArrowUp')
  await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'false')
  await expect(page.getByText('Intersection is passing under the car')).toBeHidden()
})

test('moves into a real left-turn pocket and turns with the same steering keys', async ({ page }) => {
  await openFocusedPractice(page, 'Multi-lane left turn', '?debug=1&timeScale=1&startDistance=320&seed=47')
  const roadWorld = page.getByTestId('road-world')
  const canvas = page.getByTestId('driving-canvas')

  await expect(roadWorld).toHaveAttribute('data-road-section', 'left-turn-pocket')
  await expect(roadWorld).toHaveAttribute('data-lane-id', 'pocket-through')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('status')).toHaveText(/Changing one lane left/)
  await expect.poll(async () => roadWorld.getAttribute('data-lane-id')).toBe('pocket-left-turn')
  await expect.poll(async () => Number(await canvas.getAttribute('data-lane-offset'))).toBeLessThan(-0.5)
  await expect(canvas).toHaveAttribute('data-steering-angle', '0.0')

  await expect(page.getByRole('button', { name: 'Turn left at the intersection' })).toBeVisible({ timeout: 8_000 })
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('Turning left through the intersection')).toBeVisible()
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => Number(await roadWorld.getAttribute('data-camera-heading'))).toBeLessThan(0)
})

test('home and centre pages have no serious automated accessibility violations', async ({ page }) => {
  await page.goto('?debug=1')
  let results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])

  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test.describe('mobile controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true })

  test('starts and exposes touch-sized drive controls', async ({ page }) => {
    await openFocusedPractice(page, 'Yellow-light decision', '?debug=1&timeScale=1&startDistance=80&seed=3')
    await expect(page.getByRole('button', { name: /Accelerate/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Brake/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Left mirror' }).getByText('Q', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Right signal' }).getByText('C', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Right signal' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right signal on/)
    await expect(page.getByRole('button', { name: 'Right signal' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Right shoulder check' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right shoulder checked/)
    await page.getByRole('button', { name: /Move one lane right/ }).click()
    await expect(page.getByRole('status')).toHaveText(/Changing one lane right/)
    await expect.poll(async () => page.getByTestId('road-world').getAttribute('data-lane-id')).toBe('signal-right-turn')
    await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-offset'))).toBeGreaterThan(0)
    await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-steering-angle', '0.0')
    await page.getByRole('button', { name: /Move one lane left/ }).click()
    await expect(page.getByRole('status')).toHaveText(/Changing one lane left/)
    await expect.poll(async () => page.getByTestId('road-world').getAttribute('data-lane-id')).toBe('signal-through')
    await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-steering-angle', '0.0')
  })
})

test('supports nearby primary signal keys and legacy aliases', async ({ page }) => {
  await page.goto('?seed=13')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()

  await page.keyboard.press('z')
  await expect(page.getByRole('button', { name: 'Left signal' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('c')
  await expect(page.getByRole('button', { name: 'Right signal' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press(',')
  await expect(page.getByRole('button', { name: 'Left signal' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('.')
  await expect(page.getByRole('button', { name: 'Right signal' })).toHaveAttribute('aria-pressed', 'true')
})
