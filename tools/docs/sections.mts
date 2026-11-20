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
 * A page's published URL under `siteUrl`, from its file (`guide/index.md`) or from a site link
 * (`/guide/running#worlds`). The canonical link, `og:url` and the structured data all use it, so a page
 * has one address.
 */
export function pageUrl(page: string, siteUrl: string) {
    const route = page
        .replace(/^\//, '')
        .replace(/#.*$/, '')
        .replace(/(^|\/)index(\.md)?$/, '$1')
        .replace(/\.md$/, '');
    return new URL(route, siteUrl).href;
}

/**
 * The index of the first line from `from` on, outside a code fence, that matches. A fence closes,
 * as CommonMark has it, on a line of only the opening fence's character, at least as many of them,
 * so a shorter fence or the other character inside it is part of the code.
 */
export function findUnfencedLine(lines: readonly string[], from: number, pattern: RegExp) {
    let fence: string | undefined;
    for (let index = from; index < lines.length; index++) {
        const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[index])?.slice(1);
        if (fence === undefined) {
            if (marker !== undefined) fence = marker[0];
            else if (pattern.test(lines[index])) return index;
        } else if (
            marker !== undefined &&
            marker[0][0] === fence[0] &&
            marker[0].length >= fence.length &&
            marker[1].trim() === ''
        ) {
            fence = undefined;
        }
    }
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
