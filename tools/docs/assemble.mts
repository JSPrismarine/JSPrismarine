/**
 * Stages the VitePress inputs that live outside this package: the handwritten
 * guides from the repository's `docs/` directory and the generated
 * bedrock-data the API reference needs to type-check against.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '..', '..');
const guideDir = path.join(packageDir, 'site', 'guide');

execFileSync('pnpm', ['--filter', '@jsprismarine/bedrock-data', 'run', 'generate'], {
    cwd: repoRoot,
    stdio: 'inherit'
});

rmSync(guideDir, { recursive: true, force: true });
mkdirSync(guideDir, { recursive: true });
for (const entry of readdirSync(path.join(repoRoot, 'docs'))) {
    if (!entry.endsWith('.md')) continue;
    cpSync(path.join(repoRoot, 'docs', entry), path.join(guideDir, entry));
}
console.log(`Staged ${readdirSync(guideDir).length} guide pages.`);
