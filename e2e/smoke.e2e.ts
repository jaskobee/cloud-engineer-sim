import { expect, test, type Page } from '@playwright/test'

/**
 * Smoke test of the built site: it loads, a mission starts, the main panels work and nothing logs an
 * error. The simulation itself is tested headless (tests/); this checks the shipped bundle.
 */

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  return errors
}

test('start screen → take the job → quest panel, canvas, tools and INFO work', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'You\'re the cloud engineer now.' })).toBeVisible()

  await page.getByLabel(/Guided/).check()
  await page.getByRole('button', { name: 'Take the job' }).click()

  const quest = page.locator('.pane-quest')
  await expect(quest.getByRole('heading', { name: 'PixelForge: Launch Day' })).toBeVisible()
  await expect(quest.locator('.objective')).toHaveCount(7)
  await expect(quest.locator('.message-subject').first()).toHaveText('Beta servers need to be live by Friday')

  // The clock runs.
  const clock = page.locator('.time')
  const before = await clock.innerText()
  await expect(clock).not.toHaveText(before, { timeout: 5_000 })

  // The canvas loads its lazy chunk and draws the client's test network (Mia's, North Europe).
  await expect(page.locator('.react-flow__node').filter({ hasText: 'vnet-mia-test' }).first()).toBeVisible()

  // Hints and INFO.
  await quest.locator('.objective').first().getByRole('button', { name: /Show a hint/ }).click()
  await expect(quest.locator('.hint-list').first()).toContainText('Players are on the internet')
  await quest.locator('.objective').first().getByRole('button', { name: 'About Public IP address' }).click()
  await expect(page.locator('dialog.info-dialog h2')).toHaveText('Public IP address')
  await page.keyboard.press('Escape')

  // The bottom tools switch.
  await page.getByRole('tab', { name: 'Activity log' }).click()
  await expect(page.locator('.activity-log tbody tr').first()).toContainText('mia@pixelforge.example')
  await page.getByRole('tab', { name: 'IP flow verify' }).click()
  await expect(page.locator('.pane-bottom')).toBeVisible()

  expect(errors).toEqual([])
})

test('the game saves and continues after a reload', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Take the job' }).click()
  await expect(page.locator('.pane-quest .quest-title')).toBeVisible()
  // Hiding the page saves the game (T-6).
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.reload()
  await page.getByRole('button', { name: /^Continue from/ }).click()
  await expect(page.locator('.pane-quest .quest-title')).toHaveText('PixelForge: Launch Day')
  expect(errors).toEqual([])
})

test('narrow screens: no horizontal scroll, resource list instead of the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Take the job' }).click()
  await expect(page.locator('.pane-quest .quest-title')).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})
