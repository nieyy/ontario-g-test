import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('completes an accelerated Newmarket drive and produces a review', async ({ page }) => {
  await page.goto('?debug=1&seed=17')
  await expect(page.getByRole('heading', { name: /Make the G-test routine visible/i })).toBeVisible()
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByText('G TEST PRACTICE', { exact: true })).toBeVisible()

  for (let index = 0; index < 6; index += 1) {
    const danger = page.getByRole('heading', { name: 'The exam portion stops here.' })
    const review = page.getByRole('heading', { name: /Review the dangerous moments first|Practice drive complete/i })
    await expect(danger.or(review)).toBeVisible({ timeout: 20_000 })
    if (await review.isVisible()) break
    await page.getByRole('button', { name: index === 5 ? 'End & review' : 'Continue as practice' }).click()
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
  await page.goto('?seed=43')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()

  const roadWorld = page.getByTestId('road-world')
  await expect(roadWorld).toBeVisible()
  const initialDistance = Number(await roadWorld.getAttribute('data-camera-z'))
  await page.waitForTimeout(600)
  const stoppedDistance = Number(await roadWorld.getAttribute('data-camera-z'))
  expect(stoppedDistance).toBe(initialDistance)

  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1000)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(400)
  const laterDistance = Number(await roadWorld.getAttribute('data-camera-z'))

  expect(laterDistance).toBeGreaterThan(stoppedDistance)
  await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'true')
  await expect(page.getByText(/Intersection ahead|Intersection approaching|Decision zone/)).toBeVisible()
})

test('drives across the intersection and leaves it behind', async ({ page }) => {
  await page.goto('?debug=1&timeScale=2&startDistance=228&seed=45')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()

  const roadWorld = page.getByTestId('road-world')
  await expect(roadWorld).toHaveAttribute('data-intersection-phase', 'crossing')
  await expect(page.getByText('Intersection is passing under the car')).toBeVisible()
  await page.keyboard.down('ArrowUp')
  await expect.poll(async () => roadWorld.getAttribute('data-intersection-phase'), { timeout: 6_000 }).toBe('passed')
  await page.keyboard.up('ArrowUp')
  await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'false')
  await expect(page.getByText('Intersection is passing under the car')).toBeHidden()
})

test('uses left and right steering keys for lane changes and edge turns', async ({ page }) => {
  await page.goto('?debug=1&timeScale=1&startDistance=200&seed=47')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('status')).toHaveText(/Changing one lane right.*Right lane/)
  await expect(page.getByLabel('Current lane')).toHaveText(/Right/)
  await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-position'))).toBe(1)
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-camera-x', '3.60')
  await expect(page.getByRole('button', { name: 'Turn right at the intersection' })).toBeVisible({ timeout: 8_000 })

  await page.waitForTimeout(200)
  await page.keyboard.press('a')
  await expect(page.getByRole('status')).toHaveText(/Changing one lane left.*Centre lane/)
  await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-position'))).toBe(0)
  await page.waitForTimeout(200)
  await page.keyboard.press('d')
  await expect(page.getByRole('status')).toHaveText(/Changing one lane right.*Right lane/)
  await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-position'))).toBe(1)

  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Turning right through the intersection')).toBeVisible()
  await expect.poll(async () => Number(await page.getByTestId('road-world').getAttribute('data-camera-heading'))).toBeGreaterThan(0)
  await expect(page.getByText('Scene 2/6')).toBeVisible({ timeout: 2_000 })
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
    await page.goto('?seed=3')
    await page.getByRole('button', { name: 'Choose a test centre' }).click()
    await page.getByRole('button', { name: 'Select Newmarket' }).click()
    await page.getByRole('button', { name: 'Start when ready' }).click()
    await expect(page.getByRole('button', { name: /Accelerate/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Brake/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Left mirror' }).getByText('Q', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Right signal' }).getByText('C', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Right signal' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right signal on/)
    await expect(page.getByRole('button', { name: 'Right signal' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Right shoulder check' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right shoulder checked/)
    await page.getByRole('button', { name: 'Move one lane right to Right lane' }).click()
    await expect(page.getByRole('status')).toHaveText(/Changing one lane right.*Right lane/)
    await expect(page.getByLabel('Current lane')).toHaveText(/Right/)
    await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-position'))).toBeGreaterThan(0)
    await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-position'))).toBe(1)
    await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-steering-angle', '0.0')
    await page.getByRole('button', { name: 'Move one lane left to Centre lane' }).click()
    await expect(page.getByRole('status')).toHaveText(/Changing one lane left.*Centre lane/)
    await expect(page.getByLabel('Current lane')).toHaveText(/Centre/)
    await expect.poll(async () => Number(await page.getByTestId('driving-canvas').getAttribute('data-lane-position'))).toBe(0)
    await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-steering-angle', '0.0')
  })
})

test('supports nearby primary signal keys and legacy aliases', async ({ page }) => {
  await page.goto('?seed=13')
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
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
