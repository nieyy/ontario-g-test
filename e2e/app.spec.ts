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
    await expect(page.getByRole('button', { name: 'Right signal' }).getByText('.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Right signal' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right signal on/)
    await expect(page.getByRole('button', { name: 'Right signal' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Right shoulder check' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right shoulder checked/)
    await page.getByRole('button', { name: 'Change to right lane' }).click()
    await expect(page.getByRole('status')).toHaveText(/Right lane selected/)
    await expect(page.getByLabel('Current lane')).toHaveText(/Lane:\s*Right/)
  })
})
