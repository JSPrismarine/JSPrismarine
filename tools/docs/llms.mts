/**
 * The site's pages as plain Markdown for language models and the tools built on them, as
 * `docs/plans/llms-txt.md` plans. Each page staged from the repository gets a copy at its route with
 * `.md` appended, so `/guide/running` is also `/guide/running.md` and `/guide/` is `/guide/index.md`.
 *
 * The copies start from the staged Markdown, which already has its docs facts filled in and its
 * relative links pointed at site routes (see `assemble.mts`). This module only takes off what a model
 * reading the file on its own cannot use: the front matter, and links that need the site around them.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

import { isRecord } from '../../scripts/isRecord.mts';
import { findUnfencedLine, isStagedPage, pageSummary, pageTitle, pageUrl } from './sections.mts';

/** Where a page's Markdown copy is published, under the site's URL. */
export interface MarkdownPageOptions {
    /** The page's file under `site/`, such as `guide/running.md`. */
    page: string;
    /** The published site's root URL, the root manifest's `homepage`. */
    siteUrl: string;
    /** Every page that has a Markdown copy, by its file under `site/`. Links to them point at the copy. */
    markdownPages: ReadonlySet<string>;
}

/** The pages that get a Markdown copy: those staged from the repository, whose source is Markdown written to be read. */
export const markdownPages = (pages: readonly string[]) => new Set(pages.filter(isStagedPage));

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/**
 * The page files a site route may come from: `guide/` is `guide/index.md`, and `guide/running` is
 * `guide/running.md` or, for a folder written without its slash, `guide/running/index.md`.
 */
function routeFiles(route: string) {
    return route === '' || route.endsWith('/') ? [`${route}index.md`] : [`${route}.md`, `${route}/index.md`];
}

/**
 * A link from a page as an absolute URL, at the target's Markdown copy when it has one. A link to a
 * heading of the same page stays as written, since the copy has the same headings, and so does a URL
 * with a scheme.
 */
function absoluteLink(target: string, { page, siteUrl, markdownPages }: MarkdownPageOptions) {
    if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
    const site = new URL(siteUrl);
    // Site-absolute links are written without the base, which VitePress adds to them on the site.
    const url = target.startsWith('/') ? new URL(target.slice(1), site) : new URL(target, pageUrl(page, siteUrl));
    if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname)) return url.href;
    const route = url.pathname.slice(site.pathname.length);
    const file = routeFiles(route).find((candidate) => markdownPages.has(candidate));
    if (file !== undefined) url.pathname = `${site.pathname}${file}`;
    return url.href;
}

/**
 * A staged page as its Markdown copy: no front matter, its title as the first heading, and every link
 * an absolute URL. The front matter's `title` becomes the heading when the page has none of its own,
 * and its `description` the opening paragraph when the page opens straight into a section.
 */
export function pageMarkdown(markdown: string, options: MarkdownPageOptions) {
    const frontMatter = FRONT_MATTER.exec(markdown);
    // Front matter is YAML the page's author wrote; only a string title and description are read.
    const fields: unknown = frontMatter ? parse(frontMatter[1]) : undefined;
    const field = (key: string) => {
        const value = isRecord(fields) ? fields[key] : undefined;
        return typeof value === 'string' ? value : undefined;
    };
    let body = frontMatter ? markdown.slice(frontMatter[0].length).trimStart() : markdown;

    const title = field('title');
    if (title !== undefined && pageTitle(body, '') === '') body = `# ${title}\n\n${body}`;
    const description = field('description');
    if (description !== undefined && pageSummary(body) === '') {
        const lines = body.split('\n');
        const heading = findUnfencedLine(lines, 0, /^# /);
        lines.splice(heading + 1, 0, '', description);
        body = lines.join('\n');
    }

    return body.replace(/\]\(([^)\s]+)\)/g, (_link, target: string) => `](${absoluteLink(target, options)})`);
}

/** The site's paths and pages, as VitePress gives them to `buildEnd`. */
export interface MarkdownSite {
    srcDir: string;
    outDir: string;
    pages: readonly string[];
    siteUrl: string;
}

/** Writes each staged page's Markdown copy beside its HTML in the built site, and returns how many it wrote. */
export function writeMarkdownPages({ srcDir, outDir, pages, siteUrl }: MarkdownSite) {
    const published = markdownPages(pages);
    for (const page of published) {
        const markdown = pageMarkdown(readFileSync(path.join(srcDir, page), 'utf8'), {
            page,
            siteUrl,
            markdownPages: published
        });
        mkdirSync(path.dirname(path.join(outDir, page)), { recursive: true });
        writeFileSync(path.join(outDir, page), markdown);
    }
    return published.size;
}

/**
 * The `_headers` rule that serves the Markdown copies as UTF-8 Markdown text, so a browser shows
 * them rather than downloading them and a tool reads their encoding from the response.
 */
export const markdownHeaders = ['/*.md', '  Content-Type: text/markdown; charset=utf-8', ''];
