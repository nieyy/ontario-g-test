import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function chooseNewmarket(page: Page) {
  await page.getByRole('button', { name: 'Choose a test centre' }).click()
  await page.getByRole('button', { name: 'Select Newmarket' }).click()
}

async function openGuidedPractice(page: Page) {
  await chooseNewmarket(page)
  await page.getByRole('button', { name: 'Choose Guided Practice' }).click()
}

async function chooseScenario(page: Page, heading: string) {
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: heading }) })
  await card.getByRole('button', { name: 'Practice this scene' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
}

test('keeps Exam mode free of guided Coach content', async ({ page }) => {
  await page.goto('?seed=17')
  await chooseNewmarket(page)
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()

  await expect(page.getByText('EXAM MODE', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Guided practice coach' })).toHaveCount(0)
})

test('starts a new Exam without inheriting an interrupted Guided Practice checkpoint', async ({ page }) => {
  await page.goto('?debug=1&seed=19')
  await openGuidedPractice(page)
  await chooseScenario(page, 'Right on red')
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Resume interrupted drive' })).toBeVisible()

  await chooseNewmarket(page)
  await page.getByRole('button', { name: 'Choose Exam mode' }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()
  await expect(page.getByText('EXAM MODE', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Guided practice coach' })).toHaveCount(0)
})

test('offers a full route and all six focused Guided Practice entries', async ({ page }) => {
  await page.goto('?seed=17')
  await openGuidedPractice(page)

  await expect(page.getByRole('button', { name: /Start full route/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Practice this scene' })).toHaveCount(6)
  await page.getByRole('button', { name: /Start full route/i }).click()
  await page.getByRole('button', { name: 'Start when ready' }).click()

  await expect(page.getByText('GUIDED PRACTICE', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Guided practice coach' })).toBeVisible()
  await expect(page.getByText('Scene 1/6')).toBeVisible()
})

test('guides the Right on red Mirror-Signal-Shoulder sequence with configured keys', async ({ page }) => {
  await page.goto('?seed=17')
  await openGuidedPractice(page)
  await chooseScenario(page, 'Right on red')

  const coach = page.getByRole('region', { name: 'Guided practice coach' })
  await expect(coach).toContainText('Right mirror')
  await expect(coach.getByText('E', { exact: true })).toBeVisible()
  await page.keyboard.press('e')
  await expect(coach).toContainText('Right signal')
  await expect(coach.getByText('C', { exact: true })).toBeVisible()
  await page.keyboard.press('c')
  await expect(coach).toContainText('Right shoulder')
  await expect(coach.getByText('Shift+E', { exact: true })).toBeVisible()
  await page.keyboard.press('Shift+e')
  await expect(coach).toContainText('Move right')
})

test('pauses a dangerous focused round and supports same and next retries', async ({ page }) => {
  await page.goto('?debug=1&timeScale=100&seed=17')
  await openGuidedPractice(page)
  await chooseScenario(page, 'Right on red')

  await expect(page.getByRole('heading', { name: 'Review this dangerous moment.' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Continue from here' }).click()
  await expect(page.getByText('Guided Practice round complete')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Right on red · Round 1/ })).toBeVisible()

  await page.getByRole('button', { name: 'Retry same situation' }).click()
  await expect(page.getByText('GUIDED PRACTICE', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Guided practice coach' })).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Review this dangerous moment.' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Continue from here' }).click()
  await expect(page.getByRole('heading', { name: /Right on red · Round 2/ })).toBeVisible()
  await page.getByRole('button', { name: 'Try next variation' }).click()
  await expect(page.getByText('GUIDED PRACTICE', { exact: true })).toBeVisible()
})

test('mode and Guided Practice selection have no serious accessibility violations', async ({ page }) => {
  await page.goto('?seed=17')
  await chooseNewmarket(page)
  let results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])

  await page.getByRole('button', { name: 'Choose Guided Practice' }).click()
  results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test.describe('mobile Guided Practice', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true })

  test('shows touch controls and the Coach without hiding either', async ({ page }) => {
    await page.goto('?seed=17')
    await openGuidedPractice(page)
    await chooseScenario(page, 'Right on red')

    await expect(page.getByRole('region', { name: 'Guided practice coach' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Right mirror' })).toBeVisible()
    await page.getByRole('button', { name: 'Right mirror' }).click()
    await expect(page.getByRole('region', { name: 'Guided practice coach' })).toContainText('Right signal')
  })
})
