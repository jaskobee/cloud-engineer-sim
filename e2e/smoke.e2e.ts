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

test('start screen → take the job → ticket, portal pages, map, hints and INFO work', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'You\'re the cloud engineer now.' })).toBeVisible()

  await page.getByLabel(/Guided/).check()
  await page.getByRole('button', { name: 'Take the job' }).click()

  // The portal shell: Home, with the ticket docked on the right.
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await expect(page.getByText('Simulation', { exact: true })).toBeVisible()
  const quest = page.locator('.ticket-pane')
  await expect(quest.getByRole('heading', { name: 'PixelForge: Launch Day' })).toBeVisible()
  await expect(quest.locator('.objective')).toHaveCount(7)
  await expect(quest.locator('.message-subject').first()).toHaveText('Beta servers need to be live by Friday')

  // The clock runs.
  const clock = page.locator('.time')
  const before = await clock.innerText()
  await expect(clock).not.toHaveText(before, { timeout: 5_000 })

  // A service list from Home, then the Map toggle draws the client's test network (Mia's, North Europe).
  await page.getByRole('button', { name: 'Virtual networks', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Virtual networks' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'vnet-mia-test' })).toBeVisible()
  await page.locator('.portal-header').getByRole('button', { name: 'Map' }).click()
  await expect(page.locator('.react-flow__node').filter({ hasText: 'vnet-mia-test' }).first()).toBeVisible()
  await page.locator('.portal-header').getByRole('button', { name: 'Map' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Virtual networks' })).toBeVisible()

  // Hints and INFO.
  await quest.locator('.objective').first().getByRole('button', { name: /Show a hint/ }).click()
  await expect(quest.locator('.hint-list').first()).toContainText('Players are on the internet')
  await quest.locator('.objective').first().getByRole('button', { name: 'About Public IP address' }).click()
  await expect(page.locator('dialog.info-dialog h2')).toHaveText('Public IP address')
  await page.keyboard.press('Escape')

  // Global search → Monitor → Activity log; Network Watcher → IP flow verify.
  await page.getByRole('combobox', { name: 'Search resources and services' }).fill('Monitor')
  await page.getByRole('option', { name: 'Monitor' }).click()
  await expect(page.locator('.activity-log tbody tr').first()).toContainText('mia@pixelforge.example')
  await page.getByRole('combobox', { name: 'Search resources and services' }).fill('Network Watcher')
  await page.keyboard.press('Enter')
  await page.locator('.service-menu').getByRole('button', { name: 'IP flow verify' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Network Watcher \| IP flow verify/ })).toBeVisible()

  expect(errors).toEqual([])
})

test('the game saves and continues after a reload', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Take the job' }).click()
  await expect(page.locator('.ticket-pane .quest-title')).toBeVisible()
  // Hiding the page saves the game (T-6).
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.reload()
  await page.getByRole('button', { name: /^Continue from/ }).click()
  await expect(page.locator('.ticket-pane .quest-title')).toHaveText('PixelForge: Launch Day')
  expect(errors).toEqual([])
})

test('narrow screens: no horizontal scroll, the ticket is a drawer, resource list instead of the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Take the job' }).click()
  await expect(page.locator('.ticket-drawer .quest-title')).toBeVisible()
  await page.getByRole('button', { name: 'Close ticket' }).click()
  await page.locator('.portal-header').getByRole('button', { name: 'Map' }).click()
  await expect(page.locator('.map-list')).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})
