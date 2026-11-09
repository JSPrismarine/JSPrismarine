import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A directory under `docs/` that the site publishes at the path of the same name. */
export interface DocSection {
    dir: string;
    /** Page file names, without extension, that sort ahead of the alphabetical rest. */
    first?: string[];
    title: string;
}

/** Contributor-only directories under `docs/` (such as `design`) are left out on purpose. */
export const sections = [
    { dir: 'guide', title: 'Guides', first: ['running'] },
    { dir: 'brand', title: 'Brand' },
    { dir: 'data-driven', title: 'Data-driven engine' },
    { dir: 'adr', title: 'Decisions' },
    { dir: 'plans', title: 'Plans' },
    { dir: 'research', title: 'Research' }
] satisfies DocSection[];

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

/** Reads a page's title from its first heading, falling back to its file name. */
export function pageTitle(markdown: string, fallback: string) {
    return /^# (.+)$/m.exec(markdown)?.[1].trim() ?? fallback;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The repository file a site page is built from, for "edit this page" links. A generated section index
 * points at its section folder and an API page at its package's source, since neither has one file.
 */
export function pageSource(relativePath: string): { path: string; kind: 'file' | 'folder' } {
    const root = rootPages.find(({ page }) => page === relativePath);
    if (root) return { path: root.source, kind: 'file' };

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
