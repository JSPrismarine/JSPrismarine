/**
 * Stages VitePress inputs that live outside this package: handwritten guides, a page per addon from
 * its README, and a parity tracker snapshot from the parity suite. Each staged page gets the current
 * docs facts in place of its marked values (see `facts.mts`), so the site never quotes a value the
 * code has moved past. The suite reads the generated bedrock-data, which `pnpm run docs:generate`
 * writes first, and is skipped when its inputs are unchanged (see `build-cache.mts`).
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeAnchor } from '../../packages/errors/src/JSPrismarineError.ts';
import { addonJsonLd, buildMarket, cachedDownloader, MARKET_MEDIA_DIRECTORY } from './addonMarket.mts';
import { addonReadme, loadAddons } from './addons.mts';
import { committedInputs, isKnownCommit, runStep } from './build-cache.mts';
import { loadErrors } from './code-data.mts';
import { applyFacts, loadFacts } from './facts.mts';
import { loadListingsLock } from './listings.mts';
import { ADDON_COPIES_FILE, addonMarkdown, marketMarkdown } from './llmsPages.mts';
import { loadProject } from './project.mts';
import { writeSearchIndex } from './search-index.mts';
import {
    addonReadmePath,
    IMAGE,
    isUnpublished,
    linkRoute,
    pageSummary,
    pageTitle,
    publishedPage,
    rootPages,
    sections,
    toSitePage
} from './sections.mts';
import type { TrackerData } from '../../packages/parity/src/dashboard/tracker.ts';
import { MOVED_ERRORS_FILE, type MovedErrors } from './site/.vitepress/theme/movedErrors.ts';
import type { TrackerIndex } from './site/.vitepress/theme/parity.ts';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '..', '..');
const siteDir = path.join(packageDir, 'site');
const publicDir = path.join(siteDir, 'public');
const trackerDir = path.join(publicDir, 'parity-tracker');
/** Cloudflare Pages rejects files over 25 MiB; each case chunk stays well under it. */
const trackerChunkBytes = 8 * 1024 * 1024;

// The suite runs only when something it reads changed since the tracker was last built, and then
// only the files the changes since that build reach, when the inputs it kept came from a commit.
const parityDist = path.join(repoRoot, 'packages', 'parity', 'dist');
const trackerCommitFile = path.join(parityDist, 'inputs.commit');
runStep('tracker', () => {
    const since =
        existsSync(path.join(parityDist, 'inputs', 'report.json')) && existsSync(trackerCommitFile)
            ? readFileSync(trackerCommitFile, 'utf8').trim()
            : undefined;
    const changed = since !== undefined && isKnownCommit(since) ? ['--', `--changed=${since}`] : [];
    rmSync(trackerCommitFile, { force: true });
    // The suite prints only when it is done, and it runs beside TypeDoc, so say up front what the
    // build is waiting on.
    console.error(
        changed.length > 0
            ? `Running the parity files the changes since ${since} reach; this takes minutes when a widely used package changed.`
            : 'Running the whole parity suite: no earlier run left inputs to build on.'
    );
    execFileSync('pnpm', ['--filter', '@jsprismarine/parity', 'run', 'dashboard', ...changed], {
        cwd: repoRoot,
        env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
        stdio: ['ignore', 'ignore', 'inherit']
    });
    const commit = committedInputs('tracker');
    if (commit !== undefined) writeFileSync(trackerCommitFile, commit);
});
mkdirSync(publicDir, { recursive: true });
// This generated JSON uses the schema produced by the parity dashboard.
const tracker = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages', 'parity', 'dist', 'tracker.json'), 'utf8')
) as TrackerData;
writeTrackerSnapshot(tracker);

/**
 * Writes the tracker as an index plus numbered case chunks. The top-level case list repeats every
 * family's cases, so the index drops both and the page rebuilds them from the chunks.
 */
function writeTrackerSnapshot(snapshot: TrackerData) {
    rmSync(trackerDir, { recursive: true, force: true });
    mkdirSync(trackerDir, { recursive: true });
    const chunks: string[] = [];
    let chunk: string[] = [];
    let chunkSize = 0;
    const flush = () => {
        if (chunk.length === 0) return;
        const name = `cases-${chunks.length}.json`;
        writeFileSync(path.join(trackerDir, name), `[${chunk.join(',')}]`);
        chunks.push(name);
        chunk = [];
        chunkSize = 0;
    };
    for (const family of snapshot.families) {
        for (const entry of family.cases) {
            const encoded = JSON.stringify(entry);
            if (chunkSize + encoded.length > trackerChunkBytes) flush();
            chunk.push(encoded);
            chunkSize += encoded.length + 1;
        }
    }
    flush();
    const index: TrackerIndex = {
        ...snapshot,
        cases: [],
        families: snapshot.families.map((family) => ({ ...family, cases: [] })),
        caseChunks: chunks
    };
    writeFileSync(path.join(trackerDir, 'index.json'), JSON.stringify(index));
}

// The parsed package.json is an untyped boundary; only the repository URL is read.
const manifest: { repository: { url: string } } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const blobUrl = `${manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')}/blob/master`;
const docsRoot = path.join(repoRoot, 'docs');
const sectionDirs = sections.map(({ dir }) => path.join(docsRoot, dir));
const addons = await loadAddons();

/** Where the site serves images from outside `docs/`, such as an addon's screenshot, by their repository path. */
const repoImageDir = path.join(publicDir, 'repo');
rmSync(repoImageDir, { recursive: true, force: true });

/**
 * Points relative links at their published, site-absolute pages. A link to a file the site does not publish, such as
 * package source, goes to that file on GitHub instead of a dead page; an image outside `docs/` is copied into the site,
 * since GitHub's page for it is not an image. Absolute URLs stay as written.
 */
function rewriteLinks(markdown: string, sourceFile: string) {
    return markdown.replace(
        /\]\(((?!https?:|mailto:|#)[^)\s#]+)(#[^)\s]*)?\)/g,
        (_match, target: string, anchor = '') => `](${linkTarget(target, sourceFile)}${anchor})`
    );
}

/** Where a relative link from a source file opens on the site; see {@link rewriteLinks}. */
function linkTarget(target: string, sourceFile: string) {
    const resolved = path.resolve(path.dirname(sourceFile), target);
    const repoPath = path.relative(repoRoot, resolved).split(path.sep).join('/');
    // VitePress adds the base to site-absolute links. A section's folder opens its index.
    if (sectionDirs.includes(resolved)) return `/${path.relative(docsRoot, resolved).split(path.sep).join('/')}`;
    const page = publishedPage(repoPath);
    if (page === undefined) {
        if (IMAGE.test(resolved) && !repoPath.startsWith('../') && existsSync(resolved)) {
            mkdirSync(path.dirname(path.join(repoImageDir, repoPath)), { recursive: true });
            copyFileSync(resolved, path.join(repoImageDir, repoPath));
            return `/repo/${repoPath}`;
        }
        return `${blobUrl}/${repoPath}`;
    }
    // Site-absolute, so a root page links into a section as reliably as a page inside it. A section's
    // page keeps its file name, which VitePress resolves; a root document or an addon's README is linked by route.
    return repoPath.startsWith('docs/') ? `/${page}` : `/${page.replace(/\.md$/, '')}`;
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

/**
 * A page as published: its marked values filled with the current facts and its links rewritten,
 * links inside a fact's value included.
 * @param markdown - The page's text, when it is not the source file's as written.
 */
function stagePage(sourceFile: string, markdown = readFileSync(sourceFile, 'utf8')) {
    const label = path.relative(repoRoot, sourceFile);
    const { text, unknown, stale } = applyFacts(markdown, facts);
    if (unknown.length) throw new Error(`${label} marks unknown docs facts: ${unknown.join(', ')}`);
    for (const { name } of stale) staleFacts.push(`${label}: ${name}`);
    return rewriteLinks(text, sourceFile);
}

let pages = 0;
for (const section of sections) {
    const sourceDir = path.join(repoRoot, 'docs', section.dir);
    const targetDir = path.join(siteDir, section.dir);
    rmSync(targetDir, { recursive: true, force: true });
    for (const entry of readdirSync(sourceDir, { recursive: true, encoding: 'utf8' })) {
        if (isUnpublished(section, entry)) continue;
        // A page's images sit beside it, where its links point.
        if (IMAGE.test(entry)) {
            mkdirSync(path.dirname(path.join(targetDir, entry)), { recursive: true });
            copyFileSync(path.join(sourceDir, entry), path.join(targetDir, entry));
            continue;
        }
        // A generated section's pages come from the build, below, so its Markdown stays on GitHub.
        if (!entry.endsWith('.md') || section.generated) continue;
        const target = path.join(targetDir, toSitePage(entry));
        mkdirSync(path.dirname(target), { recursive: true });
        const sourceFile = path.join(sourceDir, entry);
        writeFileSync(target, stagePage(sourceFile));
        pages++;
    }
    const index = path.join(targetDir, 'index.md');
    if (!section.generated && !existsSync(index)) writeFileSync(index, indexPage(section, targetDir));
}
// The Addons section's overview is the marketplace, with a page per addon, JSPrismarine's from
// addons/ and other people's from the snapshot in addons/listings.lock.json.
const project = loadProject();
const marketBuild = await buildMarket({
    firstParty: addons,
    lock: loadListingsLock(),
    serverVersion: project.version,
    repositoryUrl: project.repositoryUrl,
    firstPartyReadme: (addon) => applyFacts(addonReadme(addon), facts).text,
    firstPartyLink: (addon, href) => {
        const [target = '', anchor] = href.split('#');
        const readme = path.join(repoRoot, addonReadmePath(addon.name));
        const url = target === '' ? '' : linkTarget(target, readme);
        // The README reaches its page as HTML, which VitePress does not turn into routes, so this does.
        return linkRoute(anchor === undefined ? url : `${url}#${anchor}`);
    },
    download: cachedDownloader(
        path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine', 'addon-listings'),
        (message) => console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message)
    )
});
const marketMedia = path.join(publicDir, MARKET_MEDIA_DIRECTORY);
rmSync(marketMedia, { recursive: true, force: true });
for (const [file, bytes] of marketBuild.media) {
    mkdirSync(path.dirname(path.join(publicDir, file)), { recursive: true });
    writeFileSync(path.join(publicDir, file), bytes);
}
/** A page's front matter; JSON is YAML, so each value is written as JSON. */
const frontMatter = (fields: Record<string, unknown>) =>
    `---\n${Object.entries(fields)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n')}\n---\n`;
const addonsDir = path.join(siteDir, 'addons');
mkdirSync(addonsDir, { recursive: true });
writeFileSync(path.join(addonsDir, 'market.json'), JSON.stringify(marketBuild.market));
const marketDescription =
    'Behavior packs you add to a running JSPrismarine server from its console: find one, copy its install command, or list your own.';
/** The Markdown copy of each addons page, which `buildEnd` publishes beside the page (see `llmsPages.mts`). */
const addonCopies: Record<string, string> = {
    'addons/index.md': marketMarkdown(marketBuild.market, marketDescription)
};
writeFileSync(
    path.join(addonsDir, 'index.md'),
    `${frontMatter({
        title: 'Addons',
        description: marketDescription,
        layout: 'page',
        sidebar: false,
        aside: false
    })}
<script setup>
import market from './market.json';
</script>

<AddonMarket :market="market" />
`
);
for (const addonPage of marketBuild.pages) {
    const relative = `${addonPage.path.replace(/^\//, '')}`;
    const page = path.join(siteDir, `${relative}.md`);
    if (path.basename(page) === 'index.md' || existsSync(page))
        throw new Error(
            `The addon ${addonPage.id} would replace the page ${path.relative(siteDir, page)}; rename one.`
        );
    mkdirSync(path.dirname(page), { recursive: true });
    // The data goes in a file of its own: a README's text in the page itself could close its script tag.
    addonCopies[`${relative}.md`] = addonMarkdown(addonPage, marketBuild.readmes.get(addonPage.id));
    writeFileSync(`${page.slice(0, -'.md'.length)}.addon.json`, JSON.stringify(addonPage));
    writeFileSync(
        page,
        `${frontMatter({
            title: addonPage.title,
            description: addonPage.description,
            layout: 'page',
            sidebar: false,
            aside: false,
            jsonLd: addonJsonLd(addonPage)
        })}
<script setup>
import addon from './${path.basename(relative)}.addon.json';
</script>

<AddonPage :addon="addon" />
`
    );
    pages++;
}
writeFileSync(path.join(siteDir, ADDON_COPIES_FILE), JSON.stringify(addonCopies));
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
console.log(
    `Staged ${pages} pages from ${sections.length} doc sections, ${marketBuild.pages.length} addons and ${rootPages.length} root documents.`
);

// A split domain's errors moved from its page to a page per module, so the site forwards old links.
const moved: MovedErrors = {};
for (const { domain, groups } of await loadErrors()) {
    for (const { module, errors } of groups) {
        if (module === '') continue;
        moved[domain] ??= {};
        for (const { code } of errors) moved[domain][codeAnchor(code)] = module;
    }
}
writeFileSync(path.join(publicDir, MOVED_ERRORS_FILE), JSON.stringify(moved));

const search = await writeSearchIndex(siteDir);
console.log(`Indexed ${search.pages} pages and ${search.headings} headings for the site menu's search.`);
