/**
 * Refresh test fixtures from live Steam.
 *
 * Captures, per app ID:
 *   - packages/core/tests/fixtures/api/<appId>.json      — appdetails JSON
 *   - packages/core/tests/fixtures/images/<appId>-<type>.(jpg|png) — capsule art
 *   - packages/core/tests/fixtures/pages/<appId>.html    — raw store page HTML
 *
 * Run:  npx tsx scripts/refresh-fixtures.ts [appId...]
 *
 * When run without arguments, uses the DEFAULT_APP_IDS list below. Commit the
 * resulting fixture changes — the diff shows exactly what Steam changed.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const FIXTURES = join(REPO_ROOT, 'packages', 'core', 'tests', 'fixtures');

const DEFAULT_APP_IDS = ['1366800'];

const USER_AGENT =
  'AnnounceKit-Fixture-Refresh/0.1 (+https://github.com/stevenbodnar/AnnounceKit)';

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

async function fetchBinary(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

interface AppdetailsEntry {
  success: boolean;
  data?: {
    name: string;
    capsule_imagev5?: string;
    capsule_image?: string;
    header_image?: string;
  };
}

async function refreshAppId(appId: string): Promise<void> {
  console.log(`\n[${appId}] refreshing…`);

  // ── appdetails JSON
  const apiUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
  const apiJson = await fetchText(apiUrl);
  const apiPath = join(FIXTURES, 'api', `${appId}.json`);
  // Pretty-print so diffs are readable.
  await writeFile(apiPath, JSON.stringify(JSON.parse(apiJson), null, 2) + '\n', 'utf8');
  console.log(`  ✓ api/${appId}.json`);

  // ── capsule + header images
  const parsed = JSON.parse(apiJson) as Record<string, AppdetailsEntry>;
  const entry = parsed[appId];
  if (!entry?.success || !entry.data) {
    console.warn(`  ! appdetails unsuccessful for ${appId} — skipping images`);
    return;
  }

  const imageTargets: Array<[label: string, url: string | undefined]> = [
    ['capsule', entry.data.capsule_imagev5 ?? entry.data.capsule_image],
    ['header', entry.data.header_image],
  ];

  for (const [label, url] of imageTargets) {
    if (!url) continue;
    try {
      const bytes = await fetchBinary(url);
      const ext = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      const imgPath = join(FIXTURES, 'images', `${appId}-${label}.${ext}`);
      await writeFile(imgPath, bytes);
      console.log(`  ✓ images/${appId}-${label}.${ext} (${bytes.length} bytes)`);
    } catch (err) {
      console.warn(`  ! image fetch failed for ${label}: ${(err as Error).message}`);
    }
  }

  // ── store page HTML (for DOM-parsing tests)
  try {
    const storeUrl = `https://store.steampowered.com/app/${appId}?cc=us&l=english`;
    const html = await fetchText(storeUrl);
    const htmlPath = join(FIXTURES, 'pages', `${appId}.html`);
    await writeFile(htmlPath, html, 'utf8');
    console.log(`  ✓ pages/${appId}.html (${html.length} chars)`);
  } catch (err) {
    console.warn(`  ! store page fetch failed: ${(err as Error).message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const appIds = args.length > 0 ? args : DEFAULT_APP_IDS;

  await ensureDir(join(FIXTURES, 'api'));
  await ensureDir(join(FIXTURES, 'images'));
  await ensureDir(join(FIXTURES, 'pages'));

  for (const appId of appIds) {
    try {
      await refreshAppId(appId);
    } catch (err) {
      console.error(`[${appId}] failed:`, (err as Error).message);
      process.exitCode = 1;
    }
  }
}

main();
