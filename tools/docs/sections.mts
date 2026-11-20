import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A directory under `docs/` that the site publishes at the path of the same name. */
export interface DocSection {
    dir: string;
    /** Page file names, without extension, that sort ahead of the alphabetical rest. */
    first?: string[];
    /**
     * Paths inside the section, relative to it, that stay in the repository but off the site: a file
     * such as `notes/ballot.md`, or a folder such as `notes/votes/`. Links to them go to GitHub.
     */
    unpublished?: string[];
    title: string;
}

/** Contributor-only directories under `docs/` (such as `design`) are left out on purpose. */
export const sections = [
    { dir: 'guide', title: 'Guides', first: ['joining', 'running', 'extending', 'log-levels'] },
    // The overview lists JSPrismarine's own addons; the docs build adds a page per addon from
    // its README under `addons/` (see `addonPageSource`).
    { dir: 'addons', title: 'Addons' },
    { dir: 'errors', title: 'Errors' },
    // The site serves no copy of the logo and icon files, so the guide's links to them go to GitHub.
    { dir: 'brand', title: 'Brand', unpublished: ['assets/'] },
    { dir: 'data-driven', title: 'Data-driven engine' },
    { dir: 'adr', title: 'Decisions' },
    { dir: 'plans', title: 'Plans' },
    {
        dir: 'research',
        title: 'Research',
        // The console TUI decision's working papers: the ballot, the judges' votes and the review
        // rounds. Their outcome is in plan.md; they are a record, not reading for the site.
        unpublished: [
            'console-tui/ballot.md',
            'console-tui/review-wave1.md',
            'console-tui/review-wave2.md',
            'console-tui/votes/'
        ]
    }
] satisfies DocSection[];

/**
 * Whether a file or folder under a section, given relative to that section, is left off the site. A
 * folder entry covers the folder itself too, so a link to it goes to GitHub as well.
 */
export function isUnpublished(section: DocSection, relativeFile: string) {
    const file = relativeFile.split('\\').join('/');
    return (section.unpublished ?? []).some((entry) =>
        entry.endsWith('/') ? `${file}/`.startsWith(entry) : file === entry
    );
}

/** A repository-root document the site publishes as a single page. */
export interface RootPage {
    /** The file at the repository root. */
    source: string;
    /** The page's file under `site/`. */
    page: string;
}

export const rootPages = [
    { source: 'CONTRIBUTING.md', page: 'contributing.md' },
    { source: 'CODE_OF_CONDUCT.md', page: 'code-of-conduct.md' }
] satisfies RootPage[];

/** Whether a site-relative page path was staged from the repository rather than written for the site. */
export function isStagedPage(relativePath: string) {
    return (
        sections.some(({ dir }) => relativePath.startsWith(`${dir}/`)) ||
        rootPages.some(({ page }) => relativePath === page)
    );
}

/**
 * A page's path under `cleanUrls`, without a leading slash, from its file (`guide/index.md` is
 * `guide/`) or from a site link (`/guide/running#worlds` is `guide/running`). The landing page's is
 * empty.
 */
export function pageRoute(page: string) {
    return page
        .replace(/^\//, '')
        .replace(/#.*$/, '')
        .replace(/(^|\/)index(\.md)?$/, '$1')
        .replace(/\.md$/, '');
}

/**
 * A page's published URL under `siteUrl`, from its file or a site link, as `pageRoute` reads them. The
 * canonical link, `og:url`, the structured data and the link preview cards all use it, so a page has
 * one address.
 */
export function pageUrl(page: string, siteUrl: string) {
    return new URL(pageRoute(page), siteUrl).href;
}

/**
 * Each line from `from` on, marked when it is part of a code fence, its opening and closing lines
 * included. A fence closes, as CommonMark has it, on a line of only the opening fence's character, at
 * least as many of them, so a shorter fence or the other character inside it is part of the code.
 */
function* fenceLines(lines: readonly string[], from: number): Generator<{ index: number; fenced: boolean }> {
    let fence: string | undefined;
    for (let index = from; index < lines.length; index++) {
        const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[index])?.slice(1);
        if (fence === undefined) {
            if (marker !== undefined) fence = marker[0];
            yield { index, fenced: marker !== undefined };
        } else {
            if (
                marker !== undefined &&
                marker[0][0] === fence[0] &&
                marker[0].length >= fence.length &&
                marker[1].trim() === ''
            )
                fence = undefined;
            yield { index, fenced: true };
        }
    }
}

/** The index of the first line from `from` on, outside a code fence, that matches. */
export function findUnfencedLine(lines: readonly string[], from: number, pattern: RegExp) {
    for (const { index, fenced } of fenceLines(lines, from)) if (!fenced && pattern.test(lines[index])) return index;
    return -1;
}

/**
 * Reads a page's title from its first heading outside a code fence, so a `#` comment in an example
 * is not one, falling back to its file name.
 */
export function pageTitle(markdown: string, fallback: string) {
    const lines = markdown.split('\n');
    const index = findUnfencedLine(lines, 0, /^# \S/);
    return index === -1 ? fallback : lines[index].slice(2).trim();
}

/**
 * The keys of the metadata lines a page may open with, such as `Status: accepted` on a decision,
 * `Versions: ...` on a research note and the `Defined in:` line TypeDoc puts under a symbol. Only
 * these are skipped: a sentence such as "A boss bar that shows how the server keeps up: ..." also has
 * a colon, and is prose.
 */
const metadataKeys = ['Status', 'Date', 'Versions', 'Host', 'Sources', 'Picks', 'Lens', 'Defined in'];

/**
 * The blocks of an introduction that are not its prose: headings, lists, tables, quotes, HTML,
 * images, badges and metadata.
 */
const notProse = new RegExp(String.raw`^(#|[-*+|>]|<|\d+[.)]\s|!\[|\[!\[|(${metadataKeys.join('|')}): )`);

/**
 * The prose blocks between a page's title and its next heading, each on one line. Code is left out,
 * fenced or indented, so an example with a blank line in it never reads as a paragraph.
 */
function introBlocks(markdown: string) {
    const lines = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/);
    const title = findUnfencedLine(lines, 0, /^# /);
    if (title === -1) return [];
    const blocks: string[][] = [[]];
    for (const { index, fenced } of fenceLines(lines, title + 1)) {
        const line = lines[index];
        if (!fenced && /^#{1,6} /.test(line)) break;
        if (fenced || !line.trim()) blocks.push([]);
        else blocks[blocks.length - 1].push(line);
    }
    return (
        blocks
            // A block that opens indented is code, or the rest of the list item above it, such as the
            // summary under each link of a generated section index.
            .filter((block) => block.length && !/^\s/.test(block[0]))
            .map((block) => block.join(' ').replace(/\s+/g, ' ').trim())
            .filter((block) => !notProse.test(block))
    );
}

/** The first sentence of a line of prose, or all of it when it has no sentence end. */
const firstSentence = (text: string) => /^.+?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;

/**
 * A research note or plan's opening sentence that dates it rather than describing it, such as
 * "Researched 2026-10-24." or "Written 2026-11-10 for work package A5 ...": its verb and the date.
 */
function datedLead(sentence: string) {
    const verb = /^(Researched|Written|Research notes?|Started|Plan)\b/.exec(sentence)?.[1];
    const date = /\d{4}-\d{2}-\d{2}/.exec(sentence)?.[0];
    return verb && date ? { verb, date } : undefined;
}

/**
 * The most words a dated opening sentence has when it only dates the note, such as "Written
 * 2026-11-19 against `master` at `c8aa6418935`."
 */
const maxDatedLeadWords = 10;

/** The label a note's opening sentence may carry, such as `Scope:`, which a summary leaves out. */
const summaryLabel = /^(Scope|Question|The question): /;

/**
 * A page's summary for index listings: its front matter `description`, or else the first sentence of the
 * prose between its title and its first section heading. Code, metadata lines such as `Status:
 * accepted` and README badges are skipped, and a page that opens straight into a section gets none. A
 * note that opens by dating itself ("Researched 2026-10-24. Scope: what ...") is summarized by the
 * sentence after the date, and a `Scope:` or `Question:` label is left out.
 */
export function pageSummary(markdown: string) {
    const description = /^---\r?\n[\s\S]*?^description:\s*(.+)$[\s\S]*?^---$/m.exec(markdown)?.[1];
    if (description) return description.trim().replace(/^['"]|['"]$/g, '');
    const [first = '', next = ''] = introBlocks(markdown);
    const lead = firstSentence(first);
    let text = first;
    if (datedLead(lead)) {
        text = first.slice(lead.length).trim() || next;
        // A long dated sentence lists the note's sources, and the sentences after it go on about where
        // the facts came from, so such a note gets no summary rather than "Every claim names its source."
        if (!summaryLabel.test(text) && lead.split(' ').length > maxDatedLeadWords) return '';
    }
    const unlabeled = text.replace(summaryLabel, '');
    return firstSentence(unlabeled === text ? text : `${unlabeled.charAt(0).toUpperCase()}${unlabeled.slice(1)}`);
}

/** What the verb of a dated opening sentence says about the note, for a card's label. */
const datedVerbs: Record<string, string> = {
    Researched: 'Researched',
    'Research note': 'Researched',
    'Research notes': 'Researched',
    Written: 'Written',
    Plan: 'Written',
    Started: 'Started'
};

/**
 * The date a research note or plan gives in its opening sentence, such as `2026-10-24` from
 * "Researched 2026-10-24.", with what happened on it: `Researched`, `Written` or `Started`.
 */
export function pageDate(markdown: string) {
    const lead = datedLead(firstSentence(introBlocks(markdown)[0] ?? ''));
    return lead && { date: lead.date, label: datedVerbs[lead.verb] ?? lead.verb };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The page of the Addons section that an addon's README becomes. */
export const addonPagePath = (name: string) => `addons/${name}.md`;

/** An addon's README in the repository, which its page is built from. */
export const addonReadmePath = (name: string) => `addons/${name}/README.md`;

/**
 * The addon README a page of the Addons section is built from, or undefined for a page that is not
 * an addon's, such as the section's overview.
 */
export function addonPageSource(relativePath: string) {
    const name = /^addons\/([^/]+)\.md$/.exec(relativePath)?.[1];
    if (name === undefined || name === 'index') return undefined;
    const source = addonReadmePath(name);
    return existsSync(path.join(repoRoot, source)) ? source : undefined;
}

/**
 * The repository file a site page is built from, for "edit this page" links. A generated section index
 * points at its section folder and an API page at its package's source, since neither has one file.
 */
export function pageSource(relativePath: string): { path: string; kind: 'file' | 'folder' } {
    const root = rootPages.find(({ page }) => page === relativePath);
    if (root) return { path: root.source, kind: 'file' };

    const addon = addonPageSource(relativePath);
    if (addon) return { path: addon, kind: 'file' };

    const section = sections.find(({ dir }) => relativePath.startsWith(`${dir}/`));
    if (section) {
        const file = relativePath.replace(/(^|\/)index\.md$/, '$1README.md');
        if (existsSync(path.join(repoRoot, 'docs', file))) return { path: `docs/${file}`, kind: 'file' };
        return { path: `docs/${path.posix.dirname(relativePath)}`, kind: 'folder' };
    }

    const api = /^api\/@jsprismarine\/([^/]+)\//.exec(relativePath);
    if (api) return { path: `packages/${api[1]}/src`, kind: 'folder' };

    return { path: `tools/docs/site/${relativePath}`, kind: 'file' };
}

const commitTimes = new Map<string, number | undefined>();

/**
 * When a page's repository source last changed, in milliseconds, from its newest commit. Staged pages
 * are copies, so their own files carry no history; this reads the file or folder they come from. A
 * path outside git history, or a checkout without git, yields undefined.
 */
export function sourceUpdatedAt(relativePath: string) {
    const { path: source } = pageSource(relativePath);
    if (!commitTimes.has(source)) {
        let time: number | undefined;
        try {
            const seconds = execFileSync('git', ['log', '-1', '--format=%ct', '--', source], {
                cwd: repoRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            time = seconds ? Number(seconds) * 1000 : undefined;
        } catch {
            time = undefined;
        }
        commitTimes.set(source, time);
    }
    return commitTimes.get(source);
}
