import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefaultTheme } from 'vitepress';
import { type DocSection, pageTitle, sections } from '../../sections.mts';

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

/** One sidebar per staged docs section, read from the files `assemble.mts` copied into the site. */
export const sidebar = Object.fromEntries(
    sections.map((section) => [
        `/${section.dir}/`,
        [{ text: section.title, items: sidebarItems(section, `/${section.dir}/`, path.join(siteDir, section.dir)) }]
    ])
) satisfies DefaultTheme.Sidebar;
