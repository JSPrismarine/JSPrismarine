/**
 * Builds the site menu's search index: every page and its headings, plus the commands, settings and
 * packages, all read from their sources. `assemble.mts` writes it to `site/public/search-index.json`
 * after staging, and the menu fetches it the first time someone searches.
 *
 * Pages are rendered with VitePress's own Markdown renderer, so every heading anchor here is the one
 * the published page has. API symbols are not in this file: the menu reads them from the API
 * reference's sidebar only when a search asks for them.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createMarkdownRenderer } from 'vitepress';

import { loadCommands, loadSettings, type CommandData, type SettingData } from './code-data.mts';
import { loadProject } from './project.mts';
import { sections } from './sections.mts';
import { megaMenus } from './site/.vitepress/menus.mts';

/** One heading inside a page, with the start of the text under it. */
export interface HeadingEntry {
    anchor: string;
    text: string;
    excerpt: string;
}

/** One page of the site. */
export interface PageEntry {
    /** The page's site path, without the base, such as `/guide/running`. */
    url: string;
    title: string;
    /** The menu or docs section the page belongs to, such as `Guides`. */
    section: string;
    description: string;
    headings: HeadingEntry[];
}

/** Everything the menu searches, apart from the API reference. */
export interface SearchIndex {
    pages: PageEntry[];
    commands: CommandData[];
    settings: SettingData[];
    packages: { name: string; description: string; version: string }[];
}

/** Characters of section text kept per heading; enough to match a phrase and show a preview line. */
const EXCERPT_LENGTH = 220;

/** Folders under `site/` that hold no pages of their own, or pages this index leaves to their sidebar. */
const SKIPPED = new Set(['.vitepress', 'public', 'api', 'node_modules']);

/** Text content of an HTML fragment, with tags, entities and runs of whitespace reduced. */
function textOf(html: string) {
    return (
        html
            .replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, '')
            // Block-level tags separate words; inline ones such as <code> sit inside a sentence.
            .replace(/<\/?(p|li|ul|ol|h\d|br|div|tr|td|th|table|pre|blockquote)\b[^>]*>/g, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/**
 * The leading sentence or two of a text. It ends at the last full sentence that fits, when that keeps
 * at least half the length, and otherwise at a word boundary with an ellipsis.
 */
function excerpt(text: string, length = EXCERPT_LENGTH) {
    if (text.length <= length) return text;
    const cut = text.slice(0, length);
    const sentenceEnd = Math.max(...['. ', '? ', '! '].map((end) => cut.lastIndexOf(end)));
    if (sentenceEnd >= length / 2) return cut.slice(0, sentenceEnd + 1);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), length - 20))}…`;
}

/** Every Markdown file under the site, as paths relative to it. */
function sitePages(siteDir: string) {
    return readdirSync(siteDir, { recursive: true, encoding: 'utf8' }).filter(
        (file) => file.endsWith('.md') && !SKIPPED.has(file.split(path.sep)[0])
    );
}

/** The site path a page is served at. */
function routeOf(file: string) {
    return `/${file.split(path.sep).join('/')}`.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
}

/** The menu that links a page, else the docs section it sits in, for grouping results. */
function sectionOf(route: string) {
    for (const menu of megaMenus) {
        const links = [
            menu.link,
            menu.featured?.link,
            ...menu.sections.flatMap((section) => section.items.map(({ link }) => link))
        ];
        if (links.some((link) => link?.replace(/#.*$/, '') === route)) return menu.text;
    }
    const dir = route.split('/')[1];
    return sections.find((section) => section.dir === dir)?.title ?? '';
}

/** One rendered page, split into its title, its opening paragraph and its headings. */
function readPage(html: string, frontmatter: Record<string, unknown>) {
    const title =
        (typeof frontmatter.title === 'string' ? frontmatter.title : '') ||
        textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
    const firstParagraph = textOf(/<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '');
    const description =
        typeof frontmatter.description === 'string' ? frontmatter.description : excerpt(firstParagraph, 160);

    const headings: HeadingEntry[] = [];
    const heading = /<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
    const matches = [...html.matchAll(heading)];
    matches.forEach((match, index) => {
        const end = matches[index + 1]?.index ?? html.length;
        const body = html.slice((match.index ?? 0) + match[0].length, end);
        headings.push({ anchor: match[2], text: textOf(match[3]), excerpt: excerpt(textOf(body)) });
    });
    return { title, description, headings };
}

/** Builds the index from the staged site and writes it into the site's public folder. */
export async function writeSearchIndex(siteDir: string) {
    const md = await createMarkdownRenderer(siteDir);
    const pages: PageEntry[] = [];
    for (const file of sitePages(siteDir)) {
        const env: { frontmatter?: Record<string, unknown>; relativePath: string } = { relativePath: file };
        const html = md.render(readFileSync(path.join(siteDir, file), 'utf8'), env);
        const page = readPage(html, env.frontmatter ?? {});
        const route = routeOf(file);
        if (!page.title) continue;
        pages.push({ url: route, section: sectionOf(route), ...page });
    }
    pages.sort((a, b) => a.url.localeCompare(b.url));

    const { registered } = await loadCommands();
    const index: SearchIndex = {
        pages,
        commands: registered,
        settings: await loadSettings(),
        packages: loadProject().packages.map(({ name, description, version }) => ({ name, description, version }))
    };
    const target = path.join(siteDir, 'public', 'search-index.json');
    writeFileSync(target, JSON.stringify(index));
    return { pages: pages.length, headings: pages.reduce((sum, page) => sum + page.headings.length, 0), target };
}
