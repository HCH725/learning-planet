/**
 * Real-browser evidence run (desktop + mobile emulation) against the production build.
 * Usage: npm run test:browser [-- --only=gate1] [-- --headed]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Cdp, Page, launchChrome, startServer } from './harness.mjs';
import { gate1Scenarios } from './scenarios/gate1.mjs';
import { gate2Scenarios } from './scenarios/gate2.mjs';
import { gate3Scenarios } from './scenarios/gate3.mjs';

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? '';
const headed = process.argv.includes('--headed');
const scenarios = [...gate1Scenarios, ...gate2Scenarios, ...gate3Scenarios].filter((scenario) => !only || scenario.id.includes(only));

const startedAt = new Date();
const results = [];
let fatal = null;
let chrome;
let server;

function chromeVersion(bin) {
  try {
    // execFile: fixed argv array, no shell, no interpolation.
    return execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

try {
  server = await startServer();
  chrome = await launchChrome({ headless: !headed });
  const cdp = await Cdp.connect(chrome.wsUrl);
  const version = chromeVersion(chrome.bin);

  for (const scenario of scenarios) {
    const page = await Page.open(cdp, server.url, scenario.device ?? {});
    const checks = [];
    const check = (label, ok, detail) => {
      checks.push({ label, ok: Boolean(ok), detail: detail ?? null });
      if (!ok) throw new Error(`${label}${detail ? ` — ${detail}` : ''}`);
    };
    const started = Date.now();
    try {
      await scenario.run({ page, cdp, baseUrl: server.url, check, chromeVersion: version });
      results.push({ id: scenario.id, title: scenario.title, ok: true, ms: Date.now() - started, checks });
      console.log(`PASS ${scenario.id} (${checks.length} checks)`);
    } catch (error) {
      results.push({
        id: scenario.id,
        title: scenario.title,
        ok: false,
        ms: Date.now() - started,
        checks,
        error: error.message,
        consoleErrors: page.consoleErrors,
      });
      console.log(`FAIL ${scenario.id}: ${error.message}`);
      try {
        await page.screenshot(`FAIL-${scenario.id}`);
      } catch {
        /* screenshot is best effort */
      }
    } finally {
      await page.close();
    }
  }

  writeFileSync(
    'evidence/browser/report.json',
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        chrome: version,
        baseUrl: server.url,
        mode: headed ? 'headed' : 'headless',
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fatal = error;
  console.error(`FATAL ${error.stack ?? error.message}`);
} finally {
  server?.stop();
  await chrome?.close();
}

mkdirSync('evidence/browser', { recursive: true });

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} scenarios passed${failed ? `, ${failed} failed` : ''}`);
if (fatal || failed > 0) process.exitCode = 1;
