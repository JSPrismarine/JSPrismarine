import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefaultTheme } from 'vitepress';
import { type DocSection, pageTitle, sections } from '../../sections.mts';
import { cardPages } from './sectionCards.ts';

const MAX_TITLE_LENGTH = 40;

/** A heading that fits the sidebar, otherwise the file name spelled out: research notes are often titled with a question. */
function sidebarTitle(markdown: string, name: string) {
    const spelled = name.replace(/^\d+-/, '').replaceAll('-', ' ');
    const title = pageTitle(markdown, spelled);
    return title.length <= MAX_TITLE_LENGTH ? title : `${spelled[0].toUpperCase()}${spelled.slice(1)}`;
}

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lists a staged directory: pages first, ordered by name, then one collapsed group per subdirectory. */
function sidebarItems(section: DocSection, route: string, dir: string): DefaultTheme.SidebarItem[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const rank = (name: string) => {
        if (name === 'index') return -1;
        const index = section.first?.indexOf(name) ?? -1;
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const pages = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name.replace(/\.md$/, ''))
        .sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
    const groups = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    return [
        ...pages.map((name) => ({
            text:
                name === 'index' ? 'Overview' : sidebarTitle(readFileSync(path.join(dir, `${name}.md`), 'utf8'), name),
            link: name === 'index' ? route : `${route}${name}`
        })),
        ...groups.map((name) => ({
            text: name,
            collapsed: true,
            items: sidebarItems(section, `${route}${name}/`, path.join(dir, name))
        }))
    ];
}

/** A staged link as a route: no `.md`, and a folder's index as the folder. */
const linkRoute = (link: string) => link.replace(/\.md(?=#|$)/, '').replace(/\/index(?=#|$)/, '/');

/**
 * A card page's sections as sidebar groups: each second-level heading with the first link of each of
 * its list items, so the sidebar lists every page the overview offers, grouped the same way.
 */
function cardPageSidebar(section: DocSection): DefaultTheme.SidebarItem[] {
    const route = `/${section.dir}/`;
    const groups: DefaultTheme.SidebarItem[] = [{ text: section.title, items: [{ text: 'Overview', link: route }] }];
    const seen = new Set<string>();
    for (const line of readFileSync(path.join(siteDir, section.dir, 'index.md'), 'utf8').split('\n')) {
        const heading = /^## (.+)$/.exec(line);
        if (heading) groups.push({ text: heading[1], items: [] });
        const item = /^- \[([^\]]+)\]\(([^)\s]+)\)/.exec(line);
        if (!item) continue;
        // The first link to a page goes to the page itself, so the sidebar marks it while it is read.
        const link = linkRoute(item[2]);
        const page = link.replace(/#.*$/, '');
        groups.at(-1)?.items?.push({ text: item[1], link: seen.has(page) ? link : page });
        seen.add(page);
    }
    const linked = new Set(groups.flatMap(({ items = [] }) => items.map(({ link = '' }) => link.replace(/#.*$/, ''))));
    const unlisted = readdirSync(path.join(siteDir, section.dir))
        .filter((name) => name.endsWith('.md') && name !== 'index.md')
        .filter((name) => !linked.has(`${route}${name.replace(/\.md$/, '')}`));
    if (unlisted.length)
        throw new Error(`${section.dir}/index.md is the sidebar but links none of: ${unlisted.join(', ')}.`);
    return groups;
}

/**
 * One sidebar per staged docs section, read from the files `assemble.mts` copied into the site. A
 * section whose index is a card page takes its sidebar from that page's groups.
 */
export const sidebar = Object.fromEntries(
    sections.map((section) => [
        `/${section.dir}/`,
        cardPages.has(`${section.dir}/index.md`)
            ? cardPageSidebar(section)
            : [
                  {
                      text: section.title,
                      items: sidebarItems(section, `/${section.dir}/`, path.join(siteDir, section.dir))
                  }
              ]
    ])
) satisfies DefaultTheme.Sidebar;
