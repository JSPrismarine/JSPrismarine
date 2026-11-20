/**
 * Schema.org structured data for every docs page: one JSON-LD `@graph` in one
 * `<script type="application/ld+json">`, which search engines read to describe the page.
 *
 * Every graph holds the site's `WebSite` and `Organization`, which the page's own node points at by
 * `@id`, so each page stands alone for a crawler that reads only that page. The page's own node, the
 * main node, depends on where the page comes from:
 *
 * - the landing page is a `WebPage` about the server's `SoftwareApplication` and `SoftwareSourceCode`;
 * - a card overview and the API index are a `CollectionPage`;
 * - an API reference page is an `APIReference` about its package;
 * - a page staged from `docs/` is a `TechArticle`, and a staged repository-root page an `Article`;
 * - any other site page is a `WebPage`.
 *
 * A page nested below a section also gets a `BreadcrumbList`, built from the sidebar.
 *
 * A page changes its graph through its `jsonLd` frontmatter; see {@link JsonLdFrontmatter}.
 */

import path from 'node:path';

import type { DefaultTheme, HeadConfig, SiteData } from 'vitepress';

import { isRecord } from '../../scripts/isRecord.mts';
import { loadProject, packageScope, type ProjectData } from './project.mts';
import { pageUrl, rootPages, sections } from './sections.mts';
import { cardPages } from './site/.vitepress/sectionCards.ts';
import { platformList } from './site/.vitepress/theme/landing.ts';
import typedoc from './typedoc.json' with { type: 'json' };

/** A value JSON can hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** A JSON object, such as one JSON-LD node. */
export interface JsonObject {
    [key: string]: JsonValue;
}

/**
 * A page's `jsonLd` frontmatter. `false` emits no structured data for the page. Otherwise `override`
 * replaces the generated graph, or `main` and `graph` amend it; `override` cannot be combined with
 * either.
 *
 * Amending merges a patch into a generated node. A patch key set to `null` removes the property. A
 * nested object without its own `@id` or `@type` merges into the generated object of the same key;
 * any other value, arrays included, replaces it. Setting `@type` changes the node's type and keeps its
 * other properties.
 *
 * An `@id` anywhere in the frontmatter may be relative: `#faq` names a node on this page, and
 * `/#organization` resolves against the site root.
 */
export interface JsonLdFrontmatter {
    /** Merged into the page's main node, whose `@id` is the page URL and cannot change. */
    main?: JsonObject;
    /** Merged into the generated node with the same `@id`, or added to the graph when none has it. */
    graph?: JsonObject[];
    /** The page's whole graph: one node or a list of nodes. Nothing is generated. */
    override?: JsonObject | JsonObject[];
}

/** The facts about the site that every page's graph draws on. */
export interface StructuredSite {
    /** The published site root, ending in a slash. */
    url: string;
    name: string;
    description: string;
    /** The site's language as a BCP 47 tag, such as `en-US`. */
    language: string;
    /** The organization's logo, absent until the site publishes a raster icon. */
    logo?: string;
    /** The project's profiles elsewhere: its GitHub organization, npm scope and Discord server. */
    sameAs: string[];
    software: {
        version: string;
        /** The SPDX page of each license the project may be used under. */
        license: string[];
        operatingSystem: string;
        repositoryUrl: string;
        downloadUrl: string;
    };
    /** The published packages, which API reference pages are about. */
    packages: { name: string; version: string }[];
    sidebar: DefaultTheme.Sidebar;
}

/** One page, as the generator needs it. */
export interface StructuredPage {
    /** The page's file under the site root, such as `guide/running.md`. */
    relativePath: string;
    url: string;
    title: string;
    description: string;
    /** When the page's source last changed, in milliseconds since the epoch. */
    lastUpdated?: number;
    /** The page's `og:image`. */
    image?: string;
    /** The page's `jsonLd` frontmatter, as YAML parsed it. */
    jsonLd?: unknown;
}

interface Crumb {
    name: string;
    url: string;
}

const programmingLanguage = 'TypeScript';
const apiDir = path.posix.relative(typedoc.docsRoot, typedoc.out);

/** The site sections a breadcrumb trail can pass through, by their sidebar key. */
const sectionRoots = [
    ...sections.map(({ dir, title }) => ({ route: `/${dir}/`, name: title })),
    { route: `/${apiDir}/`, name: typedoc.name }
];

const nodeIds = (siteUrl: string) => ({
    website: `${siteUrl}#website`,
    organization: `${siteUrl}#organization`,
    software: `${siteUrl}#software`,
    source: `${siteUrl}#source`
});

/** An object of the entries whose value is defined, so optional facts can be listed inline. */
function defined(entries: Record<string, JsonValue | undefined>): JsonObject {
    return Object.fromEntries(
        Object.entries(entries).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    );
}

/** Converts parsed YAML to JSON. YAML reads an unquoted date as a `Date`, which becomes its ISO date. */
function toJson(value: unknown, where: string): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) {
        const iso = value.toISOString();
        return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
    }
    if (Array.isArray(value)) return value.map((item, index) => toJson(item, `${where}[${index}]`));
    if (isRecord(value))
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item, `${where}.${key}`)]));
    throw new Error(`${where} is not a JSON value.`);
}

function toNode(value: unknown, where: string): JsonObject {
    const json = toJson(value, where);
    if (!isRecord(json)) throw new Error(`${where} must be an object.`);
    return json;
}

/** Reads a page's `jsonLd` frontmatter, failing the build on a shape the contract does not allow. */
function parseFrontmatter(value: unknown, relativePath: string): JsonLdFrontmatter | false {
    const where = `${relativePath}: jsonLd`;
    if (value === undefined || value === null) return {};
    if (value === false) return false;
    if (!isRecord(value)) throw new Error(`${where} must be false or an object.`);
    const unknown = Object.keys(value).filter((key) => !['main', 'graph', 'override'].includes(key));
    if (unknown.length) throw new Error(`${where} has unknown keys: ${unknown.join(', ')}.`);
    if (value.override !== undefined && (value.main !== undefined || value.graph !== undefined))
        throw new Error(`${where}.override replaces the graph, so it cannot be combined with main or graph.`);

    const nodes = (list: unknown, key: string) => {
        if (!Array.isArray(list)) throw new Error(`${where}.${key} must be a list of objects.`);
        return list.map((item, index) => toNode(item, `${where}.${key}[${index}]`));
    };
    const frontmatter: JsonLdFrontmatter = {};
    if (value.main !== undefined) {
        frontmatter.main = toNode(value.main, `${where}.main`);
        if ('@id' in frontmatter.main)
            throw new Error(`${where}.main cannot change the page's @id; add another node under graph instead.`);
    }
    if (value.graph !== undefined) frontmatter.graph = nodes(value.graph, 'graph');
    if (value.override !== undefined)
        frontmatter.override = Array.isArray(value.override)
            ? nodes(value.override, 'override')
            : toNode(value.override, `${where}.override`);
    return frontmatter;
}

/** Resolves every relative `@id`: `#name` against the page, `/path#name` against the site root. */
function resolveIds(value: JsonValue, page: string, site: string): JsonValue {
    if (Array.isArray(value)) return value.map((item) => resolveIds(item, page, site));
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
            if (key !== '@id' || typeof item !== 'string') return [key, resolveIds(item, page, site)];
            if (item.startsWith('#')) return [key, `${page}${item}`];
            if (item.startsWith('/')) return [key, new URL(item.slice(1), site).href];
            return [key, item];
        })
    );
}

/** Merges a frontmatter patch into a generated node, by the rules {@link JsonLdFrontmatter} lists. */
export function mergeNode(target: JsonObject, patch: JsonObject): JsonObject {
    const merged = { ...target };
    for (const [key, value] of Object.entries(patch)) {
        const current = merged[key];
        if (value === null) delete merged[key];
        else if (isRecord(value) && !('@id' in value) && !('@type' in value) && isRecord(current))
            merged[key] = mergeNode(current, value);
        else merged[key] = value;
    }
    return merged;
}

/** The sidebar links of one sidebar, each with the linked items above it. */
const trailCache = new WeakMap<object, Map<string, Crumb[]>>();

function sidebarTrails(items: DefaultTheme.SidebarItem[], siteUrl: string, base: string) {
    const cached = trailCache.get(items);
    if (cached) return cached;
    const trails = new Map<string, Crumb[]>();
    const walk = (level: DefaultTheme.SidebarItem[], above: Crumb[], levelBase: string) => {
        for (const item of level) {
            const itemBase = item.base ?? levelBase;
            const url = item.link === undefined ? undefined : pageUrl(`${itemBase}${item.link}`, siteUrl);
            if (url && !trails.has(url)) trails.set(url, above);
            if (item.items) walk(item.items, url && item.text ? [...above, { name: item.text, url }] : above, itemBase);
        }
    };
    walk(items, [], base);
    trailCache.set(items, trails);
    return trails;
}

/**
 * The page's place on the site, from the home page through its section and the linked sidebar
 * entries above it. Empty for a page that sits directly under the home page or is a section's root.
 */
function breadcrumbTrail(page: StructuredPage, site: StructuredSite): Crumb[] {
    const route = `/${page.relativePath}`;
    const section = sectionRoots.find(({ route: root }) => route.startsWith(root));
    if (!section) return [];
    const sectionUrl = pageUrl(section.route, site.url);
    if (sectionUrl === page.url) return [];

    const sidebar = Array.isArray(site.sidebar) ? site.sidebar : site.sidebar[section.route];
    const { items, base } = Array.isArray(sidebar)
        ? { items: sidebar, base: '' }
        : { items: sidebar?.items ?? [], base: sidebar?.base ?? '' };
    const above = (sidebarTrails(items, site.url, base).get(page.url) ?? []).filter(
        ({ url }) => url !== sectionUrl && url !== page.url
    );
    return [
        { name: site.name, url: site.url },
        { name: section.name, url: sectionUrl },
        ...above,
        { name: page.title, url: page.url }
    ];
}

/** The generated node that describes the page itself, its `@id` the page URL. */
function mainNode(page: StructuredPage, site: StructuredSite, breadcrumb: string | undefined): JsonObject {
    const ids = nodeIds(site.url);
    const { relativePath } = page;
    const common = {
        url: page.url,
        description: page.description,
        inLanguage: site.language,
        isPartOf: { '@id': ids.website },
        dateModified: page.lastUpdated ? new Date(page.lastUpdated).toISOString() : undefined,
        image: page.image
    };
    const webPage = (type: string, extra: Record<string, JsonValue | undefined> = {}) =>
        defined({
            '@type': type,
            '@id': page.url,
            name: page.title,
            ...common,
            breadcrumb: breadcrumb ? { '@id': breadcrumb } : undefined,
            ...extra
        });
    const article = (type: string, extra: Record<string, JsonValue | undefined> = {}) =>
        defined({
            '@type': type,
            '@id': page.url,
            headline: page.title,
            ...common,
            author: { '@id': ids.organization },
            publisher: { '@id': ids.organization },
            ...extra
        });

    if (relativePath === 'index.md')
        return webPage('WebPage', { about: { '@id': ids.software }, mainEntity: { '@id': ids.software } });
    if (cardPages.has(relativePath) || relativePath === `${apiDir}/index.md`) return webPage('CollectionPage');
    if (relativePath.startsWith(`${apiDir}/`)) {
        const name = new RegExp(`^${apiDir}/(@[^/]+/[^/]+)/`).exec(relativePath)?.[1];
        const pkg = site.packages.find((published) => published.name === name);
        return article('APIReference', {
            about: pkg && {
                '@type': 'SoftwareSourceCode',
                name: pkg.name,
                version: pkg.version,
                programmingLanguage,
                codeRepository: site.software.repositoryUrl
            }
        });
    }
    if (rootPages.some(({ page: file }) => file === relativePath)) return article('Article');
    if (sections.some(({ dir }) => relativePath.startsWith(`${dir}/`))) return article('TechArticle');
    return webPage('WebPage');
}

/** The nodes every page carries, and the server's own nodes on the landing page. */
function siteNodes(site: StructuredSite, landing: boolean): JsonObject[] {
    const ids = nodeIds(site.url);
    const organization = { '@id': ids.organization };
    const nodes = [
        defined({
            '@type': 'WebSite',
            '@id': ids.website,
            url: site.url,
            name: site.name,
            description: site.description,
            inLanguage: site.language,
            publisher: organization
        }),
        defined({
            '@type': 'Organization',
            '@id': ids.organization,
            name: site.name,
            url: site.url,
            logo: site.logo,
            sameAs: site.sameAs
        })
    ];
    if (!landing) return nodes;
    return [
        ...nodes,
        {
            '@type': 'SoftwareApplication',
            '@id': ids.software,
            name: site.name,
            description: site.description,
            url: site.url,
            applicationCategory: 'GameApplication',
            applicationSubCategory: 'Game server',
            operatingSystem: site.software.operatingSystem,
            softwareVersion: site.software.version,
            license: site.software.license,
            downloadUrl: site.software.downloadUrl,
            // The server is free; Google asks for a price of 0 rather than no offer.
            offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
            author: organization,
            publisher: organization
        },
        {
            '@type': 'SoftwareSourceCode',
            '@id': ids.source,
            name: site.name,
            codeRepository: site.software.repositoryUrl,
            programmingLanguage,
            license: site.software.license,
            targetProduct: { '@id': ids.software },
            author: organization
        }
    ];
}

/**
 * The page's JSON-LD graph: the generated nodes amended by its frontmatter, or the frontmatter's own
 * graph. Undefined when the page opts out.
 *
 * @throws {Error} When the page's `jsonLd` frontmatter does not match {@link JsonLdFrontmatter}.
 */
export function pageGraph(page: StructuredPage, site: StructuredSite): JsonObject[] | undefined {
    const frontmatter = parseFrontmatter(page.jsonLd, page.relativePath);
    if (frontmatter === false) return undefined;
    const resolve = (node: JsonObject) => toNode(resolveIds(node, page.url, site.url), page.relativePath);
    if (frontmatter.override)
        return (Array.isArray(frontmatter.override) ? frontmatter.override : [frontmatter.override]).map(resolve);

    const trail = breadcrumbTrail(page, site);
    const breadcrumbId = trail.length ? `${page.url}#breadcrumb` : undefined;
    let main = mainNode(page, site, breadcrumbId);
    if (frontmatter.main) main = mergeNode(main, resolve(frontmatter.main));
    const graph = [...siteNodes(site, page.relativePath === 'index.md'), main];
    if (breadcrumbId)
        graph.push({
            '@type': 'BreadcrumbList',
            '@id': breadcrumbId,
            itemListElement: trail.map(({ name, url }, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name,
                item: url
            }))
        });

    for (const patch of (frontmatter.graph ?? []).map(resolve)) {
        const index = graph.findIndex((node) => patch['@id'] !== undefined && node['@id'] === patch['@id']);
        if (index === -1) graph.push(patch);
        else graph[index] = mergeNode(graph[index] ?? {}, patch);
    }
    return graph;
}

/**
 * The graph as a head entry. VitePress writes a script's text into the page as is, so `<`, `>` and `&`
 * become JSON escapes: a string holding `</script>` cannot end the element early. The line and
 * paragraph separators are escaped too, since some JavaScript parsers reject them in a string.
 */
export function jsonLdHead(graph: JsonObject[]): HeadConfig {
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
        /[<>&\u2028\u2029]/g,
        (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
    return ['script', { type: 'application/ld+json' }, json];
}

/** The site fields the structured data reads from VitePress. */
export type StructuredSiteData = Pick<SiteData, 'title' | 'description' | 'lang' | 'head' | 'themeConfig'>;

/** Where an `og:image` or icon link in a head list points, resolved against the site. */
function headUrl(
    head: HeadConfig[],
    siteUrl: string,
    matches: (tag: string, attrs: Record<string, string>) => boolean
) {
    const entry = head.find(([tag, attrs]) => matches(tag, attrs));
    const href = entry?.[1].content ?? entry?.[1].href;
    return href ? new URL(href, siteUrl).href : undefined;
}

let project: ProjectData | undefined;

/**
 * The site's facts, from VitePress's site data and the repository. The logo is the site's Apple touch
 * icon, or its first raster icon, so it follows the icon the head links; an inline SVG icon gives none.
 */
export function structuredSite(context: {
    siteUrl: string;
    discordInvite?: string;
    site: StructuredSiteData;
}): StructuredSite {
    const { siteUrl, discordInvite, site } = context;
    project ??= loadProject();
    const { repositoryUrl } = project;
    const scope = packageScope(project.packages);
    const icon = (rel: string) => (tag: string, attrs: Record<string, string>) =>
        tag === 'link' &&
        attrs.rel === rel &&
        attrs.href !== undefined &&
        !attrs.href.startsWith('data:') &&
        !attrs.href.endsWith('.ico');
    return {
        url: siteUrl,
        name: site.title,
        description: site.description,
        language: site.lang,
        logo: headUrl(site.head, siteUrl, icon('apple-touch-icon')) ?? headUrl(site.head, siteUrl, icon('icon')),
        sameAs: [
            repositoryUrl.slice(0, repositoryUrl.lastIndexOf('/')),
            ...(scope ? [`https://www.npmjs.com/org/${scope.replace(/^@/, '')}`] : []),
            ...(discordInvite ? [discordInvite] : [])
        ],
        software: {
            version: project.version,
            license: project.licenses.map((id) => `https://spdx.org/licenses/${id}.html`),
            operatingSystem: platformList(project, 'and'),
            repositoryUrl,
            downloadUrl: project.releasesUrl
        },
        packages: project.packages.map(({ name, version }) => ({ name, version })),
        sidebar: site.themeConfig?.sidebar ?? []
    };
}

/**
 * The page's structured data as head entries: one JSON-LD script, or none when the page opts out.
 * Call it after the rest of the page's head is set, since it reads the page's `og:image` from there.
 *
 * @param page The page, with the URL, title and description its Open Graph tags use.
 * @throws {Error} When the page's `jsonLd` frontmatter does not match {@link JsonLdFrontmatter}.
 */
export function structuredDataHead(
    page: Omit<StructuredPage, 'image' | 'jsonLd'> & { frontmatter: Record<string, unknown> },
    context: { siteUrl: string; discordInvite?: string; site: StructuredSiteData }
): HeadConfig[] {
    const pageHead = Array.isArray(page.frontmatter.head) ? page.frontmatter.head : [];
    const image = headUrl(
        [...pageHead, ...context.site.head],
        context.siteUrl,
        (tag, attrs) => tag === 'meta' && attrs.property === 'og:image'
    );
    const graph = pageGraph({ ...page, image, jsonLd: page.frontmatter.jsonLd }, structuredSite(context));
    return graph ? [jsonLdHead(graph)] : [];
}
