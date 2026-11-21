/**
 * The site's pages as plain Markdown for language models and the tools built on them, as
 * `docs/plans/llms-txt.md` plans. Each page staged from the repository gets a copy at its route with
 * `.md` appended, so `/guide/running` is also `/guide/running.md` and `/guide/` is `/guide/index.md`,
 * and `/llms.txt` lists the site's pages in the format https://llmstxt.org/ describes.
 *
 * The copies start from the staged Markdown, which already has its docs facts filled in and its
 * relative links pointed at site routes (see `assemble.mts`). This module only takes off what a model
 * reading the file on its own cannot use: the front matter, and links that need the site around them.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

import { isRecord } from '../../scripts/isRecord.mts';
import type { ProjectData } from './project.mts';
import {
    type DocSection,
    findUnfencedLine,
    isStagedPage,
    pageDate,
    pageRoute,
    pageSummary,
    pageTitle,
    pageUrl
} from './sections.mts';
import type { OverviewGroup } from './site/.vitepress/overviewGroups.mts';
import { minecraftRange, platformList } from './site/.vitepress/theme/landing.ts';
import { groupPackages } from './site/.vitepress/theme/packageAreas.ts';

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

/** One link in `/llms.txt`: the page's title, its site link and a line about it. */
export interface IndexLink {
    title: string;
    /** A site-absolute link, such as `/guide/running#worlds`, or a URL. */
    link: string;
    note: string;
}

/** A second-level section of `/llms.txt` and its links. */
export interface IndexSection {
    title: string;
    links: IndexLink[];
}

/** What `/llms.txt` says, before its links are made absolute. */
export interface LlmsIndex {
    name: string;
    summary: string;
    /** Lines of context under the summary, each written as one list item. */
    details: string[];
    /** The sections in order. The last is `Optional`, which a reader short on context may skip. */
    sections: IndexSection[];
}

/**
 * `/llms.txt` in the format https://llmstxt.org/ asks for: the name as the only H1, the summary as a
 * blockquote, context with no headings, then H2 sections of links. Each link is absolute, at the
 * page's Markdown copy when it has one.
 */
export function llmsText(index: LlmsIndex, options: Omit<MarkdownPageOptions, 'page'>) {
    const link = ({ title, link, note }: IndexLink) => {
        const url = absoluteLink(link, { ...options, page: 'index.md' });
        return `- [${title}](${url})${note ? `: ${note}` : ''}`;
    };
    return [
        `# ${index.name}`,
        `> ${index.summary}`,
        index.details.map((detail) => `- ${detail}`).join('\n'),
        ...index.sections
            .filter(({ links }) => links.length > 0)
            .map(({ title, links }) => `## ${title}\n\n${links.map(link).join('\n')}`)
    ]
        .filter((block) => block !== '')
        .join('\n\n')
        .concat('\n');
}

/** The pages and data `/llms.txt` is built from, as `buildEnd` has them. */
export interface IndexSource {
    srcDir: string;
    pages: readonly string[];
    siteUrl: string;
    summary: string;
    project: ProjectData;
    sections: readonly DocSection[];
    /** The pages of each section, by the section's route, in the order its sidebar gives them. */
    sectionLinks: (section: DocSection) => readonly string[];
    /** A card page section's groups, which are its sections in `/llms.txt` too; undefined for other sections. */
    overviewGroups: (section: DocSection) => OverviewGroup[] | undefined;
    /** When a page's source last changed, in milliseconds, for a dated section's page that gives no date. */
    updatedAt: (page: string) => number | undefined;
}

/** A dated record's age, for a page in a section marked `dated`: the date it gives, its status, or its last change. */
function datedLabel(markdown: string, updatedAt: number | undefined) {
    const date = pageDate(markdown);
    if (date) return `${date.label} ${date.date}`;
    const status = /^Status: (.+)$/m.exec(markdown)?.[1];
    if (status) return `Status: ${status}`;
    return updatedAt === undefined ? '' : `Updated ${new Date(updatedAt).toISOString().slice(0, 10)}`;
}

/**
 * What `/llms.txt` lists, read from the site: the guide's overview groups, then each section in
 * order, the published packages, and an `Optional` section with the sections marked `optional`, the
 * API reference and every other page. A page appears in the first place that lists it, so every
 * page except the landing page and the API reference's own pages appears once.
 */
export function llmsIndex(source: IndexSource): LlmsIndex {
    const pages = new Set(source.pages);
    const listed = new Set<string>();
    const markdown = (page: string) => readFileSync(path.join(source.srcDir, page), 'utf8');
    const pageOf = (link: string) => routeFiles(pageRoute(link)).find((file) => pages.has(file));

    /**
     * A link to a page, titled and described by the page itself unless the caller gives them, or
     * nothing when the page is already listed. A URL off the site is listed as given.
     */
    const pageLink = (link: string, given: Partial<IndexLink> = {}, dated = false): IndexLink[] => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return [{ title: given.title ?? link, link, note: given.note ?? '' }];
        const page = pageOf(link);
        if (page === undefined || listed.has(page)) return [];
        listed.add(page);
        const text = markdown(page);
        const copy = pageMarkdown(text, { page, siteUrl: source.siteUrl, markdownPages: pages });
        const summary = given.note || pageSummary(copy);
        const label = dated ? datedLabel(text, source.updatedAt(page)) : '';
        return [
            {
                title: given.title || pageTitle(copy, pageRoute(page) || page),
                link,
                note: label && summary ? `${label}. ${summary}` : label || summary
            }
        ];
    };

    const core: IndexSection[] = [];
    const optional: IndexLink[] = [];
    for (const section of source.sections) {
        const groups = source.overviewGroups(section);
        if (groups) {
            for (const group of groups) {
                core.push({
                    title: group.text,
                    links: group.items.flatMap((item) =>
                        pageLink(item.link, { title: item.text, note: item.description })
                    )
                });
            }
            continue;
        }
        const links = source.sectionLinks(section).flatMap((link) => pageLink(link, {}, section.dated));
        if (section.optional) optional.push(...links);
        else core.push({ title: section.title, links });
    }
    core.push({
        title: 'Packages',
        links: groupPackages(source.project.packages).flatMap(({ packages }) =>
            packages.map((pkg) => ({ title: pkg.name, link: `/api/${pkg.name}/`, note: pkg.description }))
        )
    });
    const rest = source.pages
        .filter((page) => page !== 'index.md' && !page.startsWith('api/'))
        .map((page) => `/${pageRoute(page)}`);
    optional.unshift(...pageLink('/api/'));
    optional.push(...rest.flatMap((link) => pageLink(link)));

    const { project } = source;
    return {
        name: 'JSPrismarine',
        summary: source.summary,
        details: [
            `Version ${project.version}, released under ${project.license}.`,
            `Accepts Minecraft Bedrock Edition ${minecraftRange(project)}.`,
            `Prebuilt executables for ${platformList(project)}; from source it runs on Node.js ${project.engines.node}.`,
            `Anyone can join the demo server at \`${project.demo.address}\`, port ${project.demo.port}.`
        ],
        sections: [...core, { title: 'Optional', links: optional }]
    };
}

/** Writes `/llms.txt` into the built site. */
export function writeLlmsText(source: IndexSource & { outDir: string }) {
    const index = llmsIndex(source);
    writeFileSync(
        path.join(source.outDir, 'llms.txt'),
        llmsText(index, { siteUrl: source.siteUrl, markdownPages: markdownPages(source.pages) })
    );
    return index.sections.reduce((count, { links }) => count + links.length, 0);
}
