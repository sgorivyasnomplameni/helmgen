import { expect, test } from '@playwright/test'
import { authenticateViaApi, ensureBackendHealthy, seedChartFixture } from './helpers'

test.describe('HelmGen smoke flows', () => {
  test.beforeEach(async ({ request }) => {
    await ensureBackendHealthy(request)
  })

  test('generator page renders the main workflow', async ({ page, request }) => {
    await authenticateViaApi(page, request)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Генератор Helm-чартов' })).toBeVisible()
    await expect(page.getByText('Поток работы')).toBeVisible()
    await expect(page.getByText('Основные параметры')).toBeVisible()
    await expect(page.getByText('Архитектурные рекомендации')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Открыть предпросмотр' })).toBeVisible()
  })

  test('history page shows seeded chart actions', async ({ page, request }) => {
    const auth = await authenticateViaApi(page, request)
    const seeded = await seedChartFixture(request, auth.access_token)

    await page.goto('/')
    await page.getByRole('button', { name: 'История' }).click()

    await expect(page.getByRole('heading', { name: 'История чартов' })).toBeVisible()
    const chartCard = page.locator('[data-testid="history-chart-item"]').filter({ has: page.getByText(seeded.chart.name, { exact: true }) }).first()
    await expect(chartCard.getByText(seeded.chart.name, { exact: true })).toBeVisible()
    await expect(chartCard.getByRole('button', { name: 'Проверка и deploy' })).toBeVisible()
    await expect(chartCard.getByRole('button', { name: 'Скачать' })).toBeVisible()
  })

  test('ops page opens and shows deploy console', async ({ page, request }) => {
    const auth = await authenticateViaApi(page, request)
    const seeded = await seedChartFixture(request, auth.access_token)

    await page.goto('/')
    await page.getByRole('button', { name: 'История' }).click()
    const chartCard = page.locator('[data-testid="history-chart-item"]').filter({ has: page.getByText(seeded.chart.name, { exact: true }) }).first()
    await chartCard.getByRole('button', { name: 'Проверка и deploy' }).click()

    await expect(page.getByRole('heading', { name: 'Проверка и deploy' })).toBeVisible()
    await expect(page.getByText('Инженерная консоль')).toBeVisible()
    await expect(page.getByText('Подключение к Kubernetes')).toBeVisible()
    await expect(page.getByText('Helm Template', { exact: true })).toBeVisible()
    await expect(page.getByText(seeded.chart.name, { exact: true }).first()).toBeVisible()
  })
})
