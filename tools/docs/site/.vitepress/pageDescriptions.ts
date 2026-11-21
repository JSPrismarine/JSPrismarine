import { pageRoute, pageSummary, pageTitle } from '../../sections.mts';
import { inlineText, plainText } from './markdownText.ts';
import { type CardContext, inferredDescription, splitApiTitle } from './og/cardContent.ts';

/** What a page's description is read from. */
export type DescriptionContext = Pick<CardContext, 'project' | 'menus' | 'source'>;

/** The description of the site menu's link to a page, such as "Architecture decision records." for `adr/index.md`. */
function menuDescription(relativePath: string, menus: DescriptionContext['menus']) {
    const route = pageRoute(relativePath);
    for (const menu of menus)
        for (const item of [menu, menu.featured, ...menu.sections.flatMap(({ items }) => items)])
            if (item?.link !== undefined && item.description && pageRoute(item.link) === route) return item.description;
    return undefined;
}

/**
 * The opening sentence of a page's first section, for a page whose introduction gives none: a code of
 * conduct that opens with its first section, or a research note whose opening sentence only lists its
 * sources and whose `## Summary` says what it found.
 */
function firstSectionLead(markdown: string) {
    const lines = markdown.split(/\r?\n/);
    const heading = lines.findIndex((line) => line.startsWith('## '));
    if (heading === -1) return undefined;
    const section = lines.slice(heading + 1);
    // `pageSummary` reads the prose under a page's title, so the section's heading stands in for one.
    const lead = pageSummary(`# ${lines[heading]?.slice(3)}\n\n${section.join('\n')}`);
    // A section that opens with a list, as a research note's `## Summary` does, by its first item,
    // with the item's wrapped lines joined.
    const start = section.findIndex((line) => line.trim());
    const marker = /^(?:[-*]|\d+\.) (?=\S)/.exec(section[start] ?? '');
    if (lead || !marker) return plainText(lead) || undefined;
    const end = section.findIndex((line, index) => index > start && !/^\s+\S/.test(line));
    const item = section
        .slice(start, end === -1 ? undefined : end)
        .join(' ')
        .slice(marker[0].length);
    return plainText(pageSummary(`# Item\n\n${item}`)) || undefined;
}

/** How many of an API page's members its description names before it counts the rest. */
const namedMembers = 5;

/**
 * An API page's description from what TypeDoc wrote on it, for a symbol with no doc comment, a module
 * page that only lists its exports, or a class that inherits the comment of the class it extends: "The
 * inventory/slotLog module of @jsprismarine/prismarine: PlayerContainer, SlotObserver." A module's
 * path and a symbol's name are unique within their package, so no two pages get the same one.
 */
function apiDescription(relativePath: string, markdown: string) {
    const pkg = /^api\/(@[^/]+\/[^/]+)\/./.exec(relativePath)?.[1];
    const title = pageTitle(markdown, '');
    if (!pkg || !title) return undefined;
    const { name, kind } = splitApiTitle(relativePath, inlineText(title));
    // TypeDoc titles a module or namespace page with its name alone.
    const subject = kind
        ? `The ${name} ${kind.toLowerCase()} in ${pkg}`
        : `The ${name} ${relativePath.includes('/namespaces/') ? 'namespace' : 'module'} of ${pkg}`;
    const members = [...markdown.matchAll(/^### (.+)$/gm)].map((heading) => inlineText(heading[1] ?? ''));
    if (!members.length) return `${subject}.`;
    const rest = members.length - namedMembers;
    return `${subject}: ${members.slice(0, namedMembers).join(', ')}${rest > 0 ? ` and ${rest} more` : ''}.`;
}

/**
 * TypeDoc's copies of the Markdown files a doc comment links to, such as an ADR, which the site
 * publishes beside the page they copy until #3586 points those links at the site's own pages. A copy
 * says what its original says, and does not push the original onto a weaker description.
 */
const isCopy = (relativePath: string) => relativePath.startsWith('api/_media/');

/**
 * Each page's description, for the pages whose front matter gives none, so that no two pages share
 * the site's description or each other's. A page takes the first of these that no other page takes
 * first: its own description or opening sentence, then for an API page the description
 * {@link apiDescription} builds, and for any other page its menu link's description and the opening
 * sentence of its first section. Plans that open with the same sentence about how the plan is kept,
 * and classes that inherit one doc comment, take the next. A page with none of them gets none, and the site's description stands in for it.
 *
 * @param pages - Every page of the site, by source file.
 * @returns The description of each page that has one.
 */
export function pageDescriptions(pages: readonly string[], context: DescriptionContext) {
    const candidates = new Map(
        pages.map((page) => {
            const source = context.source(page);
            const found = [
                inferredDescription(page, context),
                ...(page.startsWith('api/@')
                    ? [apiDescription(page, source)]
                    : [menuDescription(page, context.menus), firstSectionLead(source)])
            ].filter((text) => text !== undefined);
            return [page, [...new Set(found)]];
        })
    );
    const firstChoices = new Map<string, number>();
    for (const [page, [first]] of candidates)
        if (first !== undefined && !isCopy(page)) firstChoices.set(first, (firstChoices.get(first) ?? 0) + 1);

    const descriptions = new Map<string, string>();
    for (const [page, [first, ...rest]] of candidates) {
        if (first === undefined) continue;
        if (isCopy(page)) {
            descriptions.set(page, first);
            continue;
        }
        const unshared = [first, ...rest].find((text) => (firstChoices.get(text) ?? 0) <= (text === first ? 1 : 0));
        descriptions.set(page, unshared ?? first);
    }
    return descriptions;
}
