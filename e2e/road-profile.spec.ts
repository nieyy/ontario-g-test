import { expect, test, type Page, type TestInfo } from '@playwright/test'

async function openFocusedPractice(page: Page, title: string, query: string) {
  await page.goto(query)
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
  await page.getByRole('button', { name: 'Choose Guided Practice' }).click()
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title }) })
  await card.getByRole('button', { name: 'Practice this scene' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByTestId('road-world')).toBeVisible()
}

async function captureRoadKeyframe(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.getByTestId('driving-canvas').screenshot()
  expect(screenshot.byteLength).toBeGreaterThan(10_000)
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' })
}

test('renders a dynamic left-turn pocket and changes the camera lane', async ({ page }, testInfo) => {
  await openFocusedPractice(page, 'Multi-lane left turn', '?debug=1&timeScale=1&startDistance=170&seed=101')
  const world = page.getByTestId('road-world')
  const canvas = page.getByTestId('driving-canvas')
  await expect(world).toHaveAttribute('data-road-section', 'left-turn-pocket')
  await expect(world).toHaveAttribute('data-lane-id', 'pocket-through')
  await captureRoadKeyframe(page, testInfo, 'left-turn-pocket-before')

  const before = Number(await world.getAttribute('data-camera-x'))
  await page.keyboard.press('a')
  await expect.poll(async () => world.getAttribute('data-lane-id')).toBe('pocket-left-turn')
  await expect.poll(async () => Number(await world.getAttribute('data-camera-x'))).toBeLessThan(before - 0.5)
  await expect(canvas).toHaveAttribute('data-steering-angle', '0.0')
  await captureRoadKeyframe(page, testInfo, 'left-turn-pocket-after')
})

test('renders local, signal, ramp and exit sections as distinct keyframes', async ({ page }, testInfo) => {
  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=260&seed=102')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'harry-walker-local')
  await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'false')
  await captureRoadKeyframe(page, testInfo, 'local-two-way')

  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=805&seed=103')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'urban-signal-junction')
  await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'true')
  await captureRoadKeyframe(page, testInfo, 'signal-intersection')

  await openFocusedPractice(page, 'Freeway merge', '?debug=1&timeScale=1&startDistance=720&seed=104')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'highway-404-on-ramp')
  await captureRoadKeyframe(page, testInfo, 'curved-on-ramp')

  await openFocusedPractice(page, 'Freeway exit', '?debug=1&timeScale=1&startDistance=260&seed=105')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'highway-404-off-ramp')
  await captureRoadKeyframe(page, testInfo, 'off-ramp-exit')
})

test.describe('mobile landscape road profile', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true })

  test('keeps the turn pocket, stop line and signal recognizable', async ({ page }, testInfo) => {
    await openFocusedPractice(page, 'Multi-lane left turn', '?debug=1&timeScale=1&startDistance=315&seed=106')
    const world = page.getByTestId('road-world')
    await expect(world).toHaveAttribute('data-road-section', 'left-turn-pocket')
    await expect(page.getByTestId('driving-canvas')).toHaveAttribute('data-traffic-light-visible', 'true')
    await expect(page.getByRole('button', { name: /Move one lane left/ })).toBeVisible()
    await captureRoadKeyframe(page, testInfo, 'mobile-left-turn-pocket')
  })
})
