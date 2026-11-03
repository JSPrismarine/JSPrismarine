/**
 * Stages VitePress inputs that live outside this package: handwritten guides,
 * generated bedrock-data, and a parity tracker snapshot from the full suite.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '..', '..');
const guideDir = path.join(packageDir, 'site', 'guide');
const publicDir = path.join(packageDir, 'site', 'public');
const trackerPath = path.join(publicDir, 'parity-tracker.json');

execFileSync('pnpm', ['--filter', '@jsprismarine/bedrock-data', 'run', 'generate'], {
    cwd: repoRoot,
    stdio: 'inherit'
});

execFileSync('pnpm', ['--filter', '@jsprismarine/parity', 'run', 'dashboard'], {
    cwd: repoRoot,
    env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    stdio: ['ignore', 'ignore', 'inherit']
});
mkdirSync(publicDir, { recursive: true });
cpSync(path.join(repoRoot, 'packages', 'parity', 'dist', 'tracker.json'), trackerPath);

rmSync(guideDir, { recursive: true, force: true });
mkdirSync(guideDir, { recursive: true });
for (const entry of readdirSync(path.join(repoRoot, 'docs'))) {
    if (!entry.endsWith('.md')) continue;
    cpSync(path.join(repoRoot, 'docs', entry), path.join(guideDir, entry));
}
console.log(`Staged ${readdirSync(guideDir).length} guide pages.`);
