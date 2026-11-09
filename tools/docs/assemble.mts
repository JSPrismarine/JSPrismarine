/**
 * Stages VitePress inputs that live outside this package: handwritten guides and a parity
 * tracker snapshot from the full suite. Each staged page gets the current docs facts in place of its
 * marked values (see `facts.mts`), so the site never quotes a value the code has moved past. The suite reads the generated bedrock-data, which
 * `pnpm run docs:generate` writes first.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyFacts, loadFacts } from './facts.mts';
import { isUnpublished, pageTitle, rootPages, sections } from './sections.mts';
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
const rootSources = new Map(rootPages.map(({ source, page }) => [path.join(repoRoot, source), page]));

/**
 * Points relative links at their published, site-absolute pages. A link to a file the site does not publish, such as
 * package source, goes to that file on GitHub instead of a dead page. Absolute URLs stay as written.
 */
function rewriteLinks(markdown: string, sourceFile: string) {
    return markdown.replace(
        /\]\(((?!https?:|mailto:|#)[^)\s#]+)(#[^)\s]*)?\)/g,
        (_match, target: string, anchor = '') => {
            const resolved = path.resolve(path.dirname(sourceFile), target);
            const rootPage = rootSources.get(resolved);
            // VitePress adds the base to site-absolute links.
            if (rootPage) return `](/${rootPage.replace(/\.md$/, '')}${anchor})`;
            const section = sections.find(({ dir }) => resolved.startsWith(path.join(docsRoot, dir) + path.sep));
            const published =
                sectionDirs.some((dir) => resolved === dir) ||
                (section !== undefined &&
                    !isUnpublished(section, path.relative(path.join(docsRoot, section.dir), resolved)));
            if (!published) {
                const repoPath = path.relative(repoRoot, resolved).split(path.sep).join('/');
                return `](${blobUrl}/${repoPath}${anchor})`;
            }
            // Site-absolute, so a root page links into a section as reliably as a page inside it.
            const sitePath = toSitePage(path.relative(docsRoot, resolved)).split(path.sep).join('/');
            return `](/${sitePath}${anchor})`;
        }
    );
}

/**
 * A page's summary for index listings: its front matter `description`, or else the first sentence of the
 * prose between its title and its first section heading. Metadata lines such as `Status: accepted` are
 * skipped, and a page that opens straight into a section gets none.
 */
function pageSummary(markdown: string) {
    const description = /^---\r?\n[\s\S]*?^description:\s*(.+)$[\s\S]*?^---$/m.exec(markdown)?.[1];
    if (description) return description.trim().replace(/^['"]|['"]$/g, '');
    const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    const intro = body.split(/^# .+$/m)[1]?.split(/^#{2,} /m)[0] ?? '';
    const paragraph = intro
        .split(/\r?\n\s*\r?\n/)
        .map((block) => block.trim())
        .find((block) => block && !/^(#|[-*|>]|```|<|\d+\.|!\[|[A-Z][\w ]*: )/.test(block));
    if (!paragraph) return '';
    const text = paragraph.replace(/\s+/g, ' ');
    return /^.+?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
}

/** Lists a section's top-level pages, each with its opening sentence, for sections whose source has no README. */
function indexPage(section: (typeof sections)[number], dir: string) {
    const links = readdirSync(dir)
        .filter((entry) => entry.endsWith('.md'))
        .map((entry) => {
            const name = entry.replace(/\.md$/, '');
            const markdown = readFileSync(path.join(dir, entry), 'utf8');
            const summary = pageSummary(markdown);
            return `- **[${pageTitle(markdown, name)}](./${name})**${summary ? `\n\n  ${summary}` : ''}`;
        });
    return `# ${section.title}\n\n${links.join('\n')}\n`;
}

const { values: facts, missing: missingFacts } = await loadFacts();
if (missingFacts.length) {
    // The pages keep the Markdown's values for these, which may be stale; `docs:sources` fetches them.
    const message = `Docs facts unavailable, keeping the Markdown's values: ${missingFacts.join('; ')}`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}
const staleFacts: string[] = [];

/** A page as published: its links rewritten and its marked values filled with the current facts. */
function stagePage(sourceFile: string) {
    const label = path.relative(repoRoot, sourceFile);
    const { text, unknown, stale } = applyFacts(rewriteLinks(readFileSync(sourceFile, 'utf8'), sourceFile), facts);
    if (unknown.length) throw new Error(`${label} marks unknown docs facts: ${unknown.join(', ')}`);
    for (const { name } of stale) staleFacts.push(`${label}: ${name}`);
    return text;
}

let pages = 0;
for (const section of sections) {
    const sourceDir = path.join(repoRoot, 'docs', section.dir);
    const targetDir = path.join(siteDir, section.dir);
    rmSync(targetDir, { recursive: true, force: true });
    for (const entry of readdirSync(sourceDir, { recursive: true, encoding: 'utf8' })) {
        if (!entry.endsWith('.md') || isUnpublished(section, entry)) continue;
        const target = path.join(targetDir, toSitePage(entry));
        mkdirSync(path.dirname(target), { recursive: true });
        const sourceFile = path.join(sourceDir, entry);
        writeFileSync(target, stagePage(sourceFile));
        pages++;
    }
    const index = path.join(targetDir, 'index.md');
    if (!existsSync(index)) writeFileSync(index, indexPage(section, targetDir));
}
for (const { source, page } of rootPages) {
    const sourceFile = path.join(repoRoot, source);
    writeFileSync(path.join(siteDir, page), stagePage(sourceFile));
    pages++;
}
if (staleFacts.length) {
    // The site is right either way; this only says the Markdown in the repository lags behind.
    const message = `${staleFacts.length} docs fact(s) are newer than the Markdown; \`pnpm run docs:facts\` refreshes them: ${staleFacts.join('; ')}`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}
console.log(`Staged ${pages} pages from ${sections.length} doc sections and ${rootPages.length} root documents.`);
