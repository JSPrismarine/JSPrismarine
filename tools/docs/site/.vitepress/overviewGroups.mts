import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One link in an overview group: its label, its route and the line that describes it. */
export interface OverviewLink {
    description: string;
    link: string;
    text: string;
}

/** A second-level section of an overview page and the links it lists. */
export interface OverviewGroup {
    items: OverviewLink[];
    text: string;
}

/** A staged link as a route: no `.md`, and a folder's index as the folder. */
const linkRoute = (link: string) => link.replace(/\.md(?=#|$)/, '').replace(/\/index(?=#|$)/, '/');

/** Markdown inline text as plain text: link labels kept, code marks dropped, a first word raised unless it is code. */
function plain(markdown: string) {
    const text = markdown
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replaceAll('`', '')
        .replace(/\s+/g, ' ')
        .trim();
    return markdown.trimStart().startsWith('`') ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * The groups of a staged overview page (`<dir>/index.md`): each second-level heading with the first
 * link of each list item and the text after its colon. The sidebar and the site menu both read
 * them, so neither can drift from the page. The first link to a page goes to the page itself, so a
 * reader on it sees it marked; later links to the same page keep their section.
 */
export function overviewGroups(dir: string): OverviewGroup[] {
    const groups: OverviewGroup[] = [];
    const seen = new Set<string>();
    const markdown = readFileSync(path.join(siteDir, dir, 'index.md'), 'utf8');
    // A list item runs on over indented lines, so join those before reading items.
    const lines = markdown.replace(/\n {2,}(?=\S)/g, ' ').split('\n');
    for (const line of lines) {
        const heading = /^## (.+)$/.exec(line);
        if (heading) groups.push({ text: heading[1], items: [] });
        const item = /^- \[([^\]]+)\]\(([^)\s]+)\)(.*)$/.exec(line);
        if (!item) continue;
        const link = linkRoute(item[2]);
        const page = link.replace(/#.*$/, '');
        const rest = item[3];
        const colon = rest.indexOf(': ');
        groups.at(-1)?.items.push({
            text: item[1],
            link: seen.has(page) ? link : page,
            description: colon === -1 ? '' : plain(rest.slice(colon + 2))
        });
        seen.add(page);
    }
    return groups;
}
