import { expect, test } from '@playwright/test';

const PROJECT = '/p/support-bot';

test.describe('runs', () => {
  test('lists runs and narrows them with full-text search', async ({ page }) => {
    await page.goto(`${PROJECT}/runs`);
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const unfiltered = await rows.count();

    await page.getByLabel('Search').fill('induction');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/q=induction/);
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThan(unfiltered);
  });

  test('opens a run: waterfall, span detail, keyboard navigation and conversation', async ({
    page,
  }) => {
    await page.goto(`${PROJECT}/runs?tool=lookup_order`);
    await page.locator('tbody tr').first().getByRole('link').click();

    const tree = page.getByRole('tree', { name: 'Spans' });
    await expect(tree.getByRole('treeitem').first()).toBeVisible();

    await tree
      .getByRole('treeitem', { name: /lookup_order/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'lookup_order', level: 3 })).toBeVisible();
    await expect(page.getByText('orderId').first()).toBeVisible();

    await tree.getByRole('treeitem').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(tree.getByRole('treeitem').nth(1)).toBeFocused();

    await page.getByRole('tab', { name: 'Conversation' }).click();
    await expect(page.getByText(/^Ticket T-\d+/)).toBeVisible();
  });

  test('saves a run as a test case', async ({ page }) => {
    await page.goto(`${PROJECT}/runs`);
    await page.locator('tbody tr').first().getByRole('link').click();
    await page.getByRole('button', { name: 'Save as test case' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Dataset').fill('e2e-suite');
    await dialog.getByRole('button', { name: 'Save test case' }).click();
    await expect(dialog.getByText('Added to e2e-suite.')).toBeVisible();
  });

  test('builds a rewind command for the chosen step', async ({ page }) => {
    await page.goto(`${PROJECT}/runs`);
    await page.locator('tbody tr').first().getByRole('link').click();
    await page.getByRole('button', { name: 'Rewind' }).click();
    await page.getByLabel('Model (optional)').fill('claude-sonnet-5-5');
    await expect(page.getByRole('dialog').locator('code')).toContainText(
      '--model claude-sonnet-5-5',
    );
  });
});

test('bloopers shows flag counts', async ({ page }) => {
  await page.goto(`${PROJECT}/bloopers`);
  await expect(page.getByRole('heading', { name: 'Bloopers' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^loop \d+$/ })).toBeVisible();
});

test('box office renders charts and tables', async ({ page }) => {
  await page.goto(`${PROJECT}/overview`);
  await expect(page.getByRole('heading', { name: 'Box Office' })).toBeVisible();
  await expect(page.getByText('Cost per day')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'lookup_order' })).toBeVisible();
});

test('reviews show the latest eval run with per-check results', async ({ page }) => {
  await page.goto(`${PROJECT}/reviews`);
  await page.getByRole('link', { name: 'support-v1' }).first().click();
  await expect(page.getByRole('heading', { level: 1 }).getByLabel(/% passing/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /T-001/ })).toBeVisible();
});

test('creates an API key and shows it once', async ({ page }) => {
  await page.goto(`${PROJECT}/settings`);
  await page.getByLabel('Key name').fill('e2e');
  await page.getByRole('button', { name: 'Create key' }).click();
  await expect(page.getByText('Copy this key now')).toBeVisible();
  await expect(page.getByText(/POPCORN_API_KEY=pk_/)).toBeVisible();
});

test('docs render the quickstart', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Docs' }).getByRole('link', { name: 'Replay guide' }),
  ).toBeVisible();
});
