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
  const screenshot = await page.getByTestId('driving-webgl').screenshot()
  expect(screenshot.byteLength).toBeGreaterThan(10_000)
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' })
}

test('renders a dynamic left-turn pocket and changes the camera lane', async ({ page }, testInfo) => {
  await openFocusedPractice(page, 'Multi-lane left turn', '?debug=1&timeScale=1&startDistance=170&seed=101')
  const world = page.getByTestId('road-world')
  await expect(world).toHaveAttribute('data-road-section', 'left-turn-pocket')
  await expect(world).toHaveAttribute('data-lane-id', 'pocket-through')
  await captureRoadKeyframe(page, testInfo, 'left-turn-pocket-before')

  const before = Number(await world.getAttribute('data-camera-x'))
  await page.keyboard.press('a')
  await expect.poll(async () => world.getAttribute('data-lane-id')).toBe('pocket-left-turn')
  await expect.poll(async () => Number(await world.getAttribute('data-camera-x'))).toBeLessThan(before - 0.5)
  await expect(world).toHaveAttribute('data-steering-angle', '0.0')
  await captureRoadKeyframe(page, testInfo, 'left-turn-pocket-after')
})

test('starts on the right half of a two-way parking access aisle', async ({ page }, testInfo) => {
  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=0&seed=109')
  const world = page.getByTestId('road-world')
  await expect(world).toHaveAttribute('data-road-section', 'newmarket-parking-exit')
  await expect(world).toHaveAttribute('data-lane-id', 'parking-access')
  await expect.poll(async () => Number(await world.getAttribute('data-camera-x'))).toBeGreaterThan(1)
  await expect(page.getByText('Two-way · 1 your direction + 1 opposing')).toBeVisible()
  await captureRoadKeyframe(page, testInfo, 'parking-access-right-side-start')
})

test('keeps a continuous road visible while crossing a section boundary', async ({ page }, testInfo) => {
  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=590&seed=107')
  const world = page.getByTestId('road-world')
  await expect(world).toHaveAttribute('data-road-section', 'harry-walker-local')
  await expect.poll(async () => Number(await world.getAttribute('data-road-ahead-m'))).toBeGreaterThanOrEqual(312)
  await expect(world).toHaveAttribute('data-traffic-light-visible', 'true')
  await expect(page.getByText('Two-way · 1 your direction + 1 opposing')).toBeVisible()
  await captureRoadKeyframe(page, testInfo, 'local-to-signal-continuous-road')
})

test('scopes the mini-map to the selected scene and moves its vehicle marker', async ({ page }) => {
  await openFocusedPractice(page, 'Freeway merge', '?debug=1&timeScale=1&startDistance=120&seed=111')
  const map = page.locator('.route-progress-card').getByTestId('route-mini-map')
  await expect(map).toHaveAttribute('data-map-scope', 'edge-ramp,edge-mainline')
  const startX = await map.getAttribute('data-map-vehicle-x')
  const startY = await map.getAttribute('data-map-vehicle-y')
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(800)
  await page.keyboard.up('ArrowUp')
  await expect.poll(async () => `${await map.getAttribute('data-map-vehicle-x')},${await map.getAttribute('data-map-vehicle-y')}`).not.toBe(`${startX},${startY}`)
})

test('renders local, signal, ramp and exit sections as distinct keyframes', async ({ page }, testInfo) => {
  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=260&seed=102')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'harry-walker-local')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-traffic-light-visible', 'false')
  await captureRoadKeyframe(page, testInfo, 'local-two-way')

  await openFocusedPractice(page, 'Right on red', '?debug=1&timeScale=1&startDistance=805&seed=103')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'urban-signal-junction')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-traffic-light-visible', 'true')
  await captureRoadKeyframe(page, testInfo, 'signal-intersection')

  await openFocusedPractice(page, 'Freeway merge', '?debug=1&timeScale=1&startDistance=0&seed=104')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'highway-404-on-ramp')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-template', 'freeway-on-ramp')
  await expect(page.getByText('1 lane · one direction')).toBeVisible()
  await expect(page.getByRole('button', { name: /Move one lane left/ })).toBeDisabled()
  await captureRoadKeyframe(page, testInfo, 'single-lane-ramp-entry')

  await openFocusedPractice(page, 'Freeway merge', '?debug=1&timeScale=1&startDistance=270&seed=104')
  await expect(page.getByTestId('road-world')).toHaveAttribute('data-road-section', 'highway-404-on-ramp')
  await expect(page.getByText('4 lanes · one direction')).toBeVisible()
  await expect(page.getByRole('button', { name: /Move one lane left/ })).toBeDisabled()
  await captureRoadKeyframe(page, testInfo, 'separated-ramp-and-mainline')

  await openFocusedPractice(page, 'Freeway merge', '?debug=1&timeScale=1&startDistance=340&seed=104')
  await expect(page.getByRole('button', { name: /Move one lane left/ })).toBeEnabled()
  await captureRoadKeyframe(page, testInfo, 'acceleration-lane-beside-mainline')

  await openFocusedPractice(page, 'Freeway exit', '?debug=1&timeScale=1&startDistance=260&seed=105')
  const exitWorld = page.getByTestId('road-world')
  await expect(exitWorld).toHaveAttribute('data-road-section', 'highway-404-off-ramp')
  const enterExitLane = page.getByRole('button', { name: /Move one lane right/ })
  await expect(enterExitLane).toBeEnabled()
  await enterExitLane.click()
  await expect.poll(async () => exitWorld.getAttribute('data-lane-id')).toBe('exit-ramp')
  await captureRoadKeyframe(page, testInfo, 'off-ramp-exit')
})

test.describe('mobile landscape road profile', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true })

  test('keeps the turn pocket, stop line and signal recognizable', async ({ page }, testInfo) => {
    await openFocusedPractice(page, 'Multi-lane left turn', '?debug=1&timeScale=1&startDistance=315&seed=106')
    const world = page.getByTestId('road-world')
    await expect(world).toHaveAttribute('data-road-section', 'left-turn-pocket')
    await expect(world).toHaveAttribute('data-traffic-light-visible', 'true')
    await expect(page.getByRole('button', { name: /Move one lane left/ })).toBeVisible()
    await captureRoadKeyframe(page, testInfo, 'mobile-left-turn-pocket')
  })
})
