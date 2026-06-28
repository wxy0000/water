// C 步骤自动截图（Playwright）
//
// 策略：浏览器跑 + addInitScript 注入 Tauri API mock
// URL ?label=settings|popover|widget 切窗口
// 13 个 test，每个截图存到 submission/screenshots/auto/

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { injectTauriMock } from './tauri-mock';

const SHOT_DIR = 'submission/screenshots/auto';
fs.mkdirSync(SHOT_DIR, { recursive: true });

// 共享 setup：每个 test 前注入 mock
test.beforeEach(async ({ page }) => {
  await injectTauriMock(page);
});

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: false,
  });
  console.log(`[shot] ${name}.png`);
}

// 拿 mock invoke helper
async function mockInvoke<T = unknown>(
  page: Page,
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    async ({ cmd, args }) => {
      const w = window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
      };
      return (await w.__TAURI_INTERNALS__.invoke(cmd, args)) as T;
    },
    { cmd, args },
  );
}

async function openSettings(page: Page) {
  await page.goto('/?label=settings');
  // 等 settings 加载完成（"每日目标" section 出现）
  await page.waitForSelector('text=每日目标', { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function openPopover(page: Page) {
  await page.goto('/?label=popover');
  await page.waitForSelector('text=小杯', { timeout: 10000 });
  await page.waitForTimeout(500);
}

// ===== 13 个场景 =====

test('01 default settings page', async ({ page }) => {
  await openSettings(page);
  // 验证默认 dailyGoalMl = 2000（"0 / 2000 ml" 文本出现）
  await expect(page.getByText('0 / 2000 ml').first()).toBeVisible();
  // 验证默认 cups（label + 数字分别找）
  await expect(page.getByText('中杯').first()).toBeVisible();
  await expect(page.getByText('150').first()).toBeVisible();
  await expect(page.getByText('300').first()).toBeVisible();
  await expect(page.getByText('500').first()).toBeVisible();
  // 验证工作时间 label（TimePicker 内部是 2 个 number input，09:00 不在一个 text node）
  await expect(page.getByText('开始').first()).toBeVisible();
  await expect(page.getByText('结束').first()).toBeVisible();
  await shot(page, '01-default');
});

test('02 goal slider (bug #4 verification)', async ({ page }) => {
  await openSettings(page);
  // 直接改 DB 模拟"拖动 slider 到 2500"
  await mockInvoke(page, 'set_setting', { key: 'daily_goal_ml', value: '2500' });
  await page.waitForTimeout(500);
  // 验证 slider 右侧文本 + 今日卡都更新到 2500
  await expect(page.getByText(/2500 ml/).first()).toBeVisible();
  await expect(page.getByText(/0 \/ 2500/).first()).toBeVisible();
  await shot(page, '02-goal-slider');
});

test('03 cups steppers', async ({ page }) => {
  await openSettings(page);
  await mockInvoke(page, 'set_setting', { key: 'cup_small_ml', value: '200' });
  await mockInvoke(page, 'set_setting', { key: 'cup_medium_ml', value: '350' });
  await mockInvoke(page, 'set_setting', { key: 'cup_large_ml', value: '600' });
  await page.waitForTimeout(500);
  // 数字直接找：200 / 350 / 600 三个数字分别在画面里
  await expect(page.getByText('200').first()).toBeVisible();
  await expect(page.getByText('350').first()).toBeVisible();
  await expect(page.getByText('600').first()).toBeVisible();
  await shot(page, '03-cups');
});

test('04 work hours timepicker', async ({ page }) => {
  await openSettings(page);
  await mockInvoke(page, 'set_setting', { key: 'work_start', value: '08:30' });
  await mockInvoke(page, 'set_setting', { key: 'work_end', value: '17:30' });
  await page.waitForTimeout(500);
  // 验证 input 值（TimePicker 显示 2 位数 pad: 08 / 30 / 17 / 30）
  const inputs = page.locator('input[type=number]');
  await expect(inputs.nth(0)).toHaveValue('08');
  await expect(inputs.nth(1)).toHaveValue('30');
  await expect(inputs.nth(2)).toHaveValue('17');
  await expect(inputs.nth(3)).toHaveValue('30');
  await shot(page, '04-work-hours');
});

test('05 toggles (weekend + reminder off)', async ({ page }) => {
  await openSettings(page);
  // "周末也提醒" toggle 在 "周末也提醒" label 同一行
  await page.getByText('周末也提醒').click();
  await page.waitForTimeout(200);
  await page.getByText('启用提醒').click();
  await page.waitForTimeout(400);
  await shot(page, '05-toggles');
});

test('06 interval bounds', async ({ page }) => {
  await openSettings(page);
  await mockInvoke(page, 'set_setting', { key: 'reminder_min_interval_min', value: '45' });
  await mockInvoke(page, 'set_setting', { key: 'reminder_max_interval_min', value: '120' });
  await page.waitForTimeout(500);
  await expect(page.getByText('45').first()).toBeVisible();
  await expect(page.getByText('120').first()).toBeVisible();
  await shot(page, '06-interval');
});

test('07 widget toggle', async ({ page }) => {
  await openSettings(page);
  await page.getByText('显示桌面浮窗').click();
  await page.waitForTimeout(400);
  await shot(page, '07-widget-toggle');
});

test('08 clear today confirm dialog', async ({ page }) => {
  await openSettings(page);
  await page.getByText('清空今日').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('清空今日记录？')).toBeVisible();
  await shot(page, '08-clear-today');
});

test('09 clear all confirm dialog', async ({ page }) => {
  await openSettings(page);
  await page.getByText('清空全部').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('清空所有记录？')).toBeVisible();
  await shot(page, '09-clear-all');
});

test('10 trend chart (bug #5 verification)', async ({ page }) => {
  await openSettings(page);
  // 加 1 杯让今日有数据
  await mockInvoke(page, 'add_record', { amount: 300, source: 'click-medium' });
  await page.waitForTimeout(300);
  // 切到 "7 天" tab
  await page.getByText('7 天').click();
  await page.waitForTimeout(1200); // 等 spring pathLength 动画 + state 更新
  // 验证 7 天总量区出现
  await expect(page.getByText('7 天总量').first()).toBeVisible();
  await shot(page, '10-trend-chart');

  // bug #5 验证：在 7 天 tab 内再加水，今日图应该**立即**增长
  await mockInvoke(page, 'add_record', { amount: 200, source: 'click-small' });
  // 等 useWeeklyData listen → setState → React re-render 全链路
  await expect(page.getByText(/500\s*ml/)).toBeVisible({ timeout: 5000 });
  await shot(page, '10b-trend-chart-after-add');
});

test('11 keyboard nav (1/2/3 + Esc)', async ({ page }) => {
  await openPopover(page);
  // 1 → 150（小杯）
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  // total = 150
  await expect(page.getByText('150').first()).toBeVisible();

  // 2 → 300（中杯）
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  // total = 450
  await expect(page.getByText('450').first()).toBeVisible();

  // 3 → 500（大杯）
  await page.keyboard.press('3');
  await page.waitForTimeout(200);
  // total = 950
  await expect(page.getByText('950').first()).toBeVisible();

  await shot(page, '11-keyboard-nav');
});

test('12 vibrancy (visual check)', async ({ page }) => {
  await openSettings(page);
  await shot(page, '12-vibrancy');
  // 注：真实 macOS vibrancy 需 release build + 人工截图
});

test('13 blur hide', async ({ page }) => {
  await openSettings(page);
  await shot(page, '13a-before-blur');
  // 浏览器跑没 macOS 窗口 blur 行为，只验证 focus 能切走
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.waitForTimeout(200);
  await shot(page, '13-blur-hide');
});
