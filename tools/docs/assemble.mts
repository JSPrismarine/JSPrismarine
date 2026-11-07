/**
 * Stages VitePress inputs that live outside this package: handwritten guides and a parity
 * tracker snapshot from the full suite. The suite reads the generated bedrock-data, which
 * `pnpm run docs:generate` writes first.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pageTitle, sections } from './sections.mts';
import type { TrackerData } from '../../packages/parity/src/dashboard/tracker.ts';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '..', '..');
const siteDir = path.join(packageDir, 'site');
const publicDir = path.join(siteDir, 'public');
const trackerPath = path.join(publicDir, 'parity-tracker.json');

execFileSync('pnpm', ['--filter', '@jsprismarine/parity', 'run', 'dashboard'], {
    cwd: repoRoot,
    env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    stdio: ['ignore', 'ignore', 'inherit']
});
mkdirSync(publicDir, { recursive: true });
// This generated JSON uses the schema produced by the parity dashboard.
const tracker = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages', 'parity', 'dist', 'tracker.json'), 'utf8')
) as TrackerData;
writeFileSync(trackerPath, JSON.stringify(tracker));

/** VitePress serves index.md for a directory, where GitHub renders README.md. */
function toSitePage(source: string) {
    return source.replace(/(^|[\\/])README\.md$/, '$1index.md');
}

// The parsed package.json is an untyped boundary; only the repository URL is read.
const manifest: { repository: { url: string } } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const blobUrl = `${manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')}/blob/master`;
const docsRoot = path.join(repoRoot, 'docs');
const sectionDirs = sections.map(({ dir }) => path.join(docsRoot, dir));

/**
 * Points relative links at the renamed index pages. A link to a file the site does not publish, such as
 * package source, goes to that file on GitHub instead of a dead page. Absolute URLs stay as written.
 */
function rewriteLinks(markdown: string, sourceFile: string) {
    return markdown.replace(
        /\]\(((?!https?:|mailto:|#)[^)\s#]+)(#[^)\s]*)?\)/g,
        (_match, target: string, anchor = '') => {
            const resolved = path.resolve(path.dirname(sourceFile), target);
            const published = sectionDirs.some((dir) => resolved === dir || resolved.startsWith(`${dir}${path.sep}`));
            if (!published) {
                const repoPath = path.relative(repoRoot, resolved).split(path.sep).join('/');
                return `](${blobUrl}/${repoPath}${anchor})`;
            }
            return `](${target.replace(/README\.md$/, 'index.md')}${anchor})`;
        }
    );
}

/** Lists a section's top-level pages for sections whose source has no README. */
function indexPage(section: (typeof sections)[number], dir: string) {
    const links = readdirSync(dir)
        .filter((entry) => entry.endsWith('.md'))
        .map((entry) => {
            const name = entry.replace(/\.md$/, '');
            return `- [${pageTitle(readFileSync(path.join(dir, entry), 'utf8'), name)}](./${name})`;
        });
    return `# ${section.title}\n\n${links.join('\n')}\n`;
}

let pages = 0;
for (const section of sections) {
    const sourceDir = path.join(repoRoot, 'docs', section.dir);
    const targetDir = path.join(siteDir, section.dir);
    rmSync(targetDir, { recursive: true, force: true });
    for (const entry of readdirSync(sourceDir, { recursive: true, encoding: 'utf8' })) {
        if (!entry.endsWith('.md')) continue;
        const target = path.join(targetDir, toSitePage(entry));
        mkdirSync(path.dirname(target), { recursive: true });
        const sourceFile = path.join(sourceDir, entry);
        writeFileSync(target, rewriteLinks(readFileSync(sourceFile, 'utf8'), sourceFile));
        pages++;
    }
    const index = path.join(targetDir, 'index.md');
    if (!existsSync(index)) writeFileSync(index, indexPage(section, targetDir));
}
console.log(`Staged ${pages} pages from ${sections.length} doc sections.`);
