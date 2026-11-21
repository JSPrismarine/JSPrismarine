import { trackerPrimaryProgressPercent } from '../../../../../packages/parity/src/dashboard/trackerProgress.ts';
import type { ProjectData } from '../../../project.mts';
import { pageDate, pageRoute, pageSummary, pageTitle, sections } from '../../../sections.mts';
import { plainText } from '../markdownText.ts';
import { headline, minecraftRange } from '../theme/landing.ts';
import { claimingMenu } from '../theme/menuClaims.ts';
import type { MegaMenu } from '../theme/types.ts';
import { type CardStyle, landingPage } from './cardImage.ts';

/** The colored tile beside a bento card's title, by the part of the site a page belongs to. */
export type Tone = 'accent' | 'mint' | 'signal' | 'ink';

/**
 * Each site menu's tile color. The error reference is signal whatever menu links it, since signal is
 * the color of errors. A menu missing here fails the build.
 */
export const menuTones: Record<string, Tone> = {
    Guides: 'accent',
    Build: 'mint',
    Addons: 'mint',
    Project: 'ink',
    Community: 'accent'
};

/** A real number the repository records about a page, shown large with its label under it. */
export interface Figure {
    value: string;
    label: string;
    /** Whether the label is an identifier, such as a package name, which keeps its case. */
    identifier?: boolean;
}

/** What a page's card says, before it is laid out. */
export interface CardContent {
    style: CardStyle;
    title: string;
    /** Whether the title is an identifier, which the brand sets in mono rather than display type. */
    identifier: boolean;
    description?: string;
    /** The part of the site the page belongs to, such as `Guides` or `Decisions`. */
    section: string;
    tone: Tone;
    figure?: Figure;
    /**
     * The hero's label above the title: groups of runs, joined by a dot and set in caps. A run marked
     * `asIs` keeps its case, as a version or a package name does. Empty when the only label would
     * repeat the title.
     */
    eyebrow: { text: string; asIs?: boolean }[][];
    /** The landing page's headline, which its card sets instead of a fitted title. */
    headline?: typeof headline;
}

/** What `transformPageData` knows about a page: enough for its tags now and its card at the end of the build. */
export interface CardRequest {
    relativePath: string;
    style: CardStyle;
    /** The page's title, or the card's own from front matter. */
    title: string;
    /** The page's description or the card's own; undefined lets the card read the page's opening sentence. */
    description?: string;
}

/** What the build reads from the repository to fill in cards. */
export interface CardContext {
    project: ProjectData;
    /** The site menu, which says which part of the site a page belongs to. */
    menus: readonly MegaMenu[];
    /**
     * How many errors each `@jsprismarine/errors` domain defines, by domain, and each module of a split
     * domain, by its page's path such as `prismarine/world`.
     */
    errorCounts: ReadonlyMap<string, number>;
    /** Every page of the site, by source file, which section overviews and packages count. */
    pages: readonly string[];
    /** The parity tracker's behavior score, as its page shows it; undefined when no snapshot is staged. */
    parity?: { passed: number; tracked: number };
    /** How many people the contributors page lists; undefined when GitHub could not be reached. */
    contributors?: number;
    /** A page's Markdown, as staged in the site folder. */
    source(relativePath: string): string;
}

/**
 * TypeDoc's symbol kinds that TypeScript names with a shorter keyword, which a card's figure tile has
 * room for: `enum` for an enumeration, `type` for a type alias.
 */
const kindKeywords: Record<string, string> = { Enumeration: 'Enum', 'Type alias': 'Type' };

/**
 * An API page's title without the symbol kind TypeDoc puts in front of it: `Molang` and `Class` from
 * `Class: Molang`. Titles of other pages come back whole.
 */
export function splitApiTitle(relativePath: string, title: string) {
    const kind = relativePath.startsWith('api/') ? /^([A-Z][a-z]+(?: [A-Z][a-z]+)*): (\S.*)$/.exec(title) : null;
    if (!kind) return { name: title, kind: undefined };
    const sentenceCase = `${kind[1].charAt(0)}${kind[1].slice(1).toLowerCase()}`;
    return { name: kind[2], kind: kindKeywords[sentenceCase] ?? sentenceCase };
}

/**
 * The title a page's card sets: an API page's without its symbol kind, which the figure tile shows,
 * and a package's error reference by the package's name alone, or with its module's, since the tile
 * says it is the error reference.
 */
export function cardTitle(relativePath: string, title: string) {
    const name = splitApiTitle(relativePath, title).name;
    const errors = /^errors\/[^/]+(?:\/[^/]+)?\.md$/.test(relativePath)
        ? /^(@\S+\/\S+(?: \S+)?) errors$/.exec(name)
        : null;
    return errors ? errors[1] : name;
}

/** The landing page's headline as one line of text. */
export const headlineText = `${headline.lines.join(' ')} ${headline.highlight}`;

/** Every page a menu links, its featured link first, as routes without anchors. */
const menuRoutes = (menu: MegaMenu) =>
    [menu.featured?.link, ...menu.sections.flatMap(({ items }) => items.map(({ link }) => link))].flatMap((link) =>
        link ? [link.replace(/#.*$/, '').replace(/^\//, '')] : []
    );

/**
 * The menu a page belongs to: the menu that claims it, else the first that links the page, else the
 * first that links a page in its top-level folder, as the site menu marks a section's pages.
 */
function pageMenu(route: string, menus: readonly MegaMenu[]) {
    const folder = route.includes('/') ? `${route.split('/')[0]}/` : undefined;
    return (
        claimingMenu(`/${route}`, menus) ??
        menus.find((menu) => menuRoutes(menu).includes(route)) ??
        (folder ? menus.find((menu) => menuRoutes(menu).some((link) => link.startsWith(folder))) : undefined)
    );
}

/** The name and tile color of the part of the site a page belongs to. */
export function pageSection(relativePath: string, menus: readonly MegaMenu[]): { section: string; tone: Tone } {
    const route = pageRoute(relativePath);
    const folder = route.split('/')[0] ?? '';
    const menu = pageMenu(route, menus);
    const menuTone = menu && menuTones[menu.text];
    if (menu && !menuTone) throw new Error(`The site menu's ${menu.text} section has no card color in menuTones.`);
    const tone = folder === 'errors' ? 'signal' : (menuTone ?? 'accent');
    // A folder the menu links as a whole, such as `/api/` or `/adr/`, takes that link's name.
    const folderLink = menu?.sections.flatMap(({ items }) => items).find(({ link }) => link === `/${folder}/`);
    const docsSection = sections.find(({ dir }) => dir === folder);
    return {
        section: folderLink?.text ?? docsSection?.title ?? menu?.text ?? 'JSPrismarine',
        tone
    };
}

/**
 * The hero's label for a page: the group of the site menu that links it, such as `Status` for the
 * parity tracker, or the menu's name when no group does. A label that repeats the title gives way to
 * the menu's name, and is left out when that repeats it too.
 */
export function pageEyebrow(relativePath: string, title: string, menus: readonly MegaMenu[]) {
    const route = pageRoute(relativePath);
    const menu = pageMenu(route, menus);
    const group = menu?.sections.find(({ items }) =>
        items.some(({ link }) => link.replace(/#.*$/, '').replace(/^\//, '') === route)
    );
    const same = (text: string) => text.toLowerCase() === title.toLowerCase();
    return [group?.text, menu?.text].find((text): text is string => text !== undefined && !same(text));
}

/** An ADR's status line, such as `Accepted 2026-11-18` for `Status: accepted, 2026-11-18, with ...`. */
export function adrStatus(markdown: string) {
    const status = /^Status:\s*([A-Za-z]+)(?:,\s*(\d{4}-\d{2}-\d{2}))?/m.exec(markdown);
    if (!status) return undefined;
    const state = `${status[1].charAt(0).toUpperCase()}${status[1].slice(1).toLowerCase()}`;
    return status[2] ? `${state} ${status[2]}` : state;
}

/** A count as a figure: grouped by thousands, with its unit, plural unless there is one. */
const count = (value: number, unit: string, plural = `${unit}s`): Figure => ({
    value: value.toLocaleString('en-US'),
    label: value === 1 ? unit : plural
});

/**
 * What a section overview counts: the pages in its folder, named for what they are. The error
 * reference counts errors instead, and the brand guide has no pages to count.
 */
const sectionUnits: Record<string, string> = {
    guide: 'guide',
    addons: 'addon',
    'data-driven': 'page',
    adr: 'decision',
    plans: 'plan',
    research: 'note'
};

/** The figure a page's card shows, when the repository records one for it. */
export function pageFigure(relativePath: string, context: CardContext): Figure | undefined {
    const { project, errorCounts, pages } = context;
    const adr = /^adr\/(\d{4})-[^/]+\.md$/.exec(relativePath);
    if (adr) return { value: adr[1], label: adrStatus(context.source(relativePath)) ?? 'Decision' };

    const errors = /^errors\/([^/]+(?:\/[^/]+)?)\.md$/.exec(relativePath);
    if (errors) {
        // The modules' counts are in their domain's already, so the total adds only the domains.
        const total =
            errors[1] === 'index'
                ? [...errorCounts].reduce((sum, [page, n]) => (page.includes('/') ? sum : sum + n), 0)
                : errorCounts.get(errors[1]);
        return total === undefined ? undefined : count(total, 'error');
    }

    const api = /^api\/(@[^/]+\/[^/]+)\/(.+)$/.exec(relativePath);
    if (api) {
        // The kind comes from the page's own heading, which a card's title from front matter does not change.
        const kind = splitApiTitle(relativePath, pageTitle(context.source(relativePath), '')).kind;
        if (kind) return { value: kind, label: api[1], identifier: true };
        if (api[2] !== 'index.md') return undefined;
        // TypeDoc gives every class a page of its own under a `classes` folder, nested namespaces included.
        const classes = pages.filter(
            (page) => page.startsWith(`api/${api[1]}/`) && /\/classes\/[^/]+\.md$/.test(page)
        ).length;
        return classes ? count(classes, 'class', 'classes') : undefined;
    }

    const overview = /^([^/]+)\/index\.md$/.exec(relativePath)?.[1];
    const unit = overview && sectionUnits[overview];
    if (overview && unit) {
        const inside = pages.filter((page) => page.startsWith(`${overview}/`) && page !== relativePath).length;
        return inside ? count(inside, unit) : undefined;
    }

    if (relativePath === 'api/index.md' || relativePath === 'packages.md')
        return count(project.packages.length, 'package');
    if (relativePath === 'releases.md') return { value: `v${project.version}`, label: 'latest release' };
    if (relativePath === 'parity.md' && context.parity)
        return {
            value: `${trackerPrimaryProgressPercent(context.parity.passed, context.parity.tracked)}%`,
            label: 'behavior parity'
        };
    if (relativePath === 'contributors.md' && context.contributors) return count(context.contributors, 'contributor');

    const dated = pageDate(context.source(relativePath));
    return dated && { value: dated.date, label: dated.label };
}

/** Whether a title names code, such as a class or a package, which the brand sets in mono. */
const isIdentifier = (relativePath: string, title: string) =>
    relativePath.startsWith('api/@') || /@[\w.-]+\/[\w.-]+/.test(title);

/** The page's own description, or its package's for an API package page, or else its opening sentence. */
function cardDescription({ relativePath, description }: CardRequest, context: CardContext) {
    if (description) return description;
    // An ADR shows its number and status instead of a description.
    if (relativePath.startsWith('adr/')) return undefined;
    const api = /^api\/(@[^/]+\/[^/]+)\/index\.md$/.exec(relativePath);
    const published = api && context.project.packages.find(({ name }) => name === api[1]);
    return published?.description || plainText(pageSummary(context.source(relativePath))) || undefined;
}

/** Everything a page's card says, from the page and the repository. */
export function describeCard(request: CardRequest, context: CardContext): CardContent {
    const { relativePath, style } = request;
    const { section, tone } = pageSection(relativePath, context.menus);
    const description = cardDescription(request, context);

    if (relativePath === landingPage) {
        const { project } = context;
        return {
            style,
            title: headlineText,
            identifier: false,
            description,
            section,
            tone,
            headline,
            eyebrow: [[{ text: `v${project.version}`, asIs: true }], [{ text: `Minecraft ${minecraftRange(project)}` }]]
        };
    }
    const title = cardTitle(relativePath, request.title);
    const eyebrow = pageEyebrow(relativePath, title, context.menus);
    return {
        style,
        title,
        identifier: isIdentifier(relativePath, title),
        description,
        section,
        tone,
        figure: pageFigure(relativePath, context),
        eyebrow: eyebrow ? [[{ text: eyebrow }]] : []
    };
}
