import { expect, test } from '@playwright/test'
import { authenticateViaApi, ensureBackendHealthy } from './helpers'

test.describe('HelmGen visual snapshots', () => {
  test.beforeEach(async ({ page, request }) => {
    await ensureBackendHealthy(request)
    await authenticateViaApi(page, request)
  })

  test('generator layout snapshot', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveScreenshot('generator-page.png', { fullPage: true })
  })
})
