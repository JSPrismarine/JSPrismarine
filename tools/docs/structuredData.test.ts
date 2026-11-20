import type { DefaultTheme } from 'vitepress';
import { describe, expect, it } from 'vitest';

import { isRecord } from '../../scripts/isRecord.mts';
import { loadProject } from './project.mts';
import { pageUrl, sections } from './sections.mts';
import {
    type JsonObject,
    type JsonValue,
    jsonLdHead,
    pageGraph,
    type StructuredPage,
    type StructuredSiteData,
    structuredDataHead,
    structuredSite
} from './structuredData.mts';
import typedoc from './typedoc.json' with { type: 'json' };

const siteUrl = 'https://docs.example/';
const discordInvite = 'https://discord.gg/example';
const project = loadProject();
const [pkg] = project.packages;
if (!pkg) throw new Error('The repository publishes no packages to test the API reference with.');
const apiPackage = `/api/${pkg.name}/`;

const sidebar = {
    '/guide/': [
        { text: 'Overview', link: '/guide/' },
        { text: 'Host', items: [{ text: 'Running', link: '/guide/running#run-the-prebuilt-server' }] }
    ],
    '/research/': [
        {
            text: 'Research',
            items: [
                { text: 'Overview', link: '/research/' },
                // An unlinked group is a heading, not a page, so no breadcrumb names it.
                { text: 'console-tui', collapsed: true, items: [{ text: 'Plan', link: '/research/console-tui/plan' }] }
            ]
        }
    ],
    '/api/': [
        {
            text: 'Data',
            items: [
                {
                    text: pkg.name.split('/')[1] ?? pkg.name,
                    link: `${apiPackage}index.md`,
                    items: [{ text: 'Classes', items: [{ text: 'Thing', link: `${apiPackage}classes/Thing.md` }] }]
                }
            ]
        }
    ]
} satisfies DefaultTheme.Sidebar;

const siteData: StructuredSiteData = {
    title: 'JSPrismarine',
    description: 'A server',
    lang: 'en-US',
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: 'data:image/svg+xml,<svg/>' }]],
    themeConfig: { sidebar }
};
const site = structuredSite({ siteUrl, discordInvite, site: siteData });

function page(relativePath: string, extra: Partial<StructuredPage> = {}): StructuredPage {
    return {
        relativePath,
        url: pageUrl(relativePath, siteUrl),
        title: `Title of ${relativePath}`,
        description: `About ${relativePath}`,
        ...extra
    };
}

function graphOf(input: StructuredPage) {
    const graph = pageGraph(input, site);
    if (!graph) throw new Error(`${input.relativePath} emitted no graph.`);
    return graph;
}

function node(graph: Record<string, unknown>[], type: string) {
    const found = graph.find((entry) => entry['@type'] === type);
    if (!found) throw new Error(`The graph has no ${type} node.`);
    return found;
}

const idOf = (value: unknown) => (isRecord(value) ? value['@id'] : undefined);

/** Every `{ "@id": ... }` reference in the graph, at any depth. */
function references(value: JsonValue, found: string[] = []): string[] {
    if (Array.isArray(value)) for (const item of value) references(item, found);
    else if (isRecord(value)) {
        const id = value['@id'];
        if (typeof id === 'string' && Object.keys(value).length === 1) found.push(id);
        for (const item of Object.values(value)) references(item, found);
    }
    return found;
}

function expectReferencesResolve(graph: JsonObject[]) {
    const ids = new Set(graph.map((entry) => entry['@id']));
    for (const id of references(graph)) expect(ids, `${id} is referenced but not in the graph`).toContain(id);
}

function crumbs(graph: JsonObject[]) {
    const list: unknown = node(graph, 'BreadcrumbList').itemListElement;
    if (!Array.isArray(list)) throw new Error('The breadcrumb list has no items.');
    return list.filter(isRecord);
}

describe('pageGraph', () => {
    it('describes the server on the landing page from the repository', () => {
        const graph = graphOf(page('index.md'));
        expectReferencesResolve(graph);
        const main = node(graph, 'WebPage');
        const software = node(graph, 'SoftwareApplication');
        expect(main['@id']).toBe(siteUrl);
        expect(idOf(main.mainEntity)).toBe(software['@id']);
        expect(software).toMatchObject({
            name: siteData.title,
            softwareVersion: project.version,
            downloadUrl: project.releasesUrl,
            applicationCategory: 'GameApplication',
            offers: { price: 0 }
        });
        expect(software.license).toContain(project.license);
        for (const { os } of project.executables)
            expect(software.operatingSystem).toContain({ linux: 'Linux', darwin: 'macOS', windows: 'Windows' }[os]);
        expect(node(graph, 'SoftwareSourceCode')).toMatchObject({
            codeRepository: project.repositoryUrl,
            targetProduct: { '@id': software['@id'] }
        });
        expect(node(graph, 'Organization').sameAs).toEqual(
            expect.arrayContaining([discordInvite, expect.stringMatching(/^https:\/\/www\.npmjs\.com\/org\//)])
        );
        expect(graph.some((entry) => entry['@type'] === 'BreadcrumbList')).toBe(false);
    });

    it('makes a guide a TechArticle dated by its source, with a breadcrumb through its section', () => {
        const lastUpdated = Date.UTC(2026, 10, 1, 12);
        const input = page('guide/running.md', { lastUpdated, image: `${siteUrl}og/running.png` });
        const graph = graphOf(input);
        expectReferencesResolve(graph);
        const article = node(graph, 'TechArticle');
        expect(article).toMatchObject({
            '@id': input.url,
            headline: input.title,
            description: input.description,
            dateModified: new Date(lastUpdated).toISOString(),
            image: input.image,
            inLanguage: siteData.lang
        });
        expect(idOf(article.publisher)).toBe(node(graph, 'Organization')['@id']);
        expect(idOf(article.isPartOf)).toBe(node(graph, 'WebSite')['@id']);
        expect(crumbs(graph).map(({ name, item, position }) => ({ name, item, position }))).toEqual([
            { name: siteData.title, item: siteUrl, position: 1 },
            { name: sections.find(({ dir }) => dir === 'guide')?.title, item: `${siteUrl}guide/`, position: 2 },
            { name: input.title, item: input.url, position: 3 }
        ]);
    });

    it('makes an API page an APIReference about its package, under the package in the trail', () => {
        const input = page(`api/${pkg.name}/classes/Thing.md`);
        const graph = graphOf(input);
        expect(node(graph, 'APIReference').about).toMatchObject({
            '@type': 'SoftwareSourceCode',
            name: pkg.name,
            version: pkg.version,
            programmingLanguage: 'TypeScript'
        });
        expect(crumbs(graph).map(({ name, item }) => [name, item])).toEqual([
            [siteData.title, siteUrl],
            [typedoc.name, `${siteUrl}api/`],
            [sidebar['/api/'][0]?.items[0]?.text, pageUrl(apiPackage, siteUrl)],
            [input.title, input.url]
        ]);
    });

    it('names only linked sidebar entries in a nested trail', () => {
        const input = page('research/console-tui/plan.md');
        expect(crumbs(graphOf(input)).map(({ item }) => item)).toEqual([siteUrl, `${siteUrl}research/`, input.url]);
    });

    it('gives a section root and a top-level page no trail', () => {
        for (const relativePath of ['guide/index.md', 'packages.md', 'research/index.md']) {
            expect(graphOf(page(relativePath)).some((entry) => entry['@type'] === 'BreadcrumbList')).toBe(false);
        }
        expect(node(graphOf(page('guide/index.md')), 'CollectionPage')['@id']).toBe(`${siteUrl}guide/`);
        expect(node(graphOf(page('packages.md')), 'WebPage')['@id']).toBe(`${siteUrl}packages`);
    });

    it('amends the main node: nested objects merge, typed objects and arrays replace, null removes', () => {
        const input = page('guide/running.md', {
            image: `${siteUrl}og.png`,
            jsonLd: {
                main: {
                    '@type': 'HowTo',
                    image: null,
                    isPartOf: { name: 'The docs' },
                    author: { '@type': 'Person', name: 'A. Writer' },
                    keywords: ['server', 'hosting'],
                    datePublished: new Date('2024-05-01')
                }
            }
        });
        const graph = graphOf(input);
        const main = graph.find((entry) => entry['@id'] === input.url);
        expect(main).toMatchObject({
            '@type': 'HowTo',
            headline: input.title,
            isPartOf: { '@id': `${siteUrl}#website`, name: 'The docs' },
            author: { '@type': 'Person', name: 'A. Writer' },
            keywords: ['server', 'hosting'],
            datePublished: '2024-05-01'
        });
        expect(main).not.toHaveProperty('image');
        expect(idOf(main?.author)).toBeUndefined();
    });

    it('adds frontmatter nodes, and merges one into the generated node with the same @id', () => {
        const input = page('guide/running.md', {
            jsonLd: {
                graph: [
                    { '@type': 'FAQPage', '@id': '#faq', isPartOf: { '@id': '#' } },
                    { '@id': '/#organization', sameAs: ['https://example.org/jsp'] }
                ]
            }
        });
        const graph = graphOf(input);
        expect(node(graph, 'FAQPage')).toEqual({
            '@type': 'FAQPage',
            '@id': `${input.url}#faq`,
            isPartOf: { '@id': `${input.url}#` }
        });
        expect(node(graph, 'Organization')).toMatchObject({
            name: siteData.title,
            sameAs: ['https://example.org/jsp']
        });
        expect(graph.filter((entry) => entry['@type'] === 'Organization')).toHaveLength(1);
    });

    it('replaces the whole graph with an override', () => {
        const input = page('guide/running.md', {
            jsonLd: { override: { '@type': 'Dataset', '@id': '#data', name: 'Block states' } }
        });
        expect(pageGraph(input, site)).toEqual([
            { '@type': 'Dataset', '@id': `${input.url}#data`, name: 'Block states' }
        ]);
    });

    it('emits nothing for a page that opts out', () => {
        const input = page('guide/running.md', { jsonLd: false });
        expect(pageGraph(input, site)).toBeUndefined();
        expect(structuredDataHead({ ...input, frontmatter: { jsonLd: false } }, { siteUrl, site: siteData })).toEqual(
            []
        );
    });

    it.each([
        [{ extra: {} }, /unknown keys: extra/],
        [{ main: {}, override: [] }, /cannot be combined/],
        [{ main: { '@id': '#other' } }, /cannot change the page's @id/],
        [{ graph: { '@type': 'Thing' } }, /must be a list/],
        ['yes', /must be false or an object/]
    ])('rejects the frontmatter %j', (jsonLd, message) => {
        expect(() => pageGraph(page('guide/running.md', { jsonLd }), site)).toThrow(message);
    });
});

describe('jsonLdHead', () => {
    it('escapes markup so a value cannot close the script, and still parses to the same graph', () => {
        const graph = [{ '@type': 'Thing', name: '</script><!-- & \u2028 -->' }];
        const [tag, attrs, json = ''] = jsonLdHead(graph);
        expect([tag, attrs]).toEqual(['script', { type: 'application/ld+json' }]);
        expect(json).not.toMatch(/[<>&\u2028]/);
        expect(JSON.parse(json)).toEqual({ '@context': 'https://schema.org', '@graph': graph });
    });
});

describe('structuredDataHead', () => {
    it("reads the page's og:image and the site's raster icon from the head", () => {
        const withIcon: StructuredSiteData = {
            ...siteData,
            head: [...siteData.head, ['link', { rel: 'apple-touch-icon', href: '/icon-180.png' }]]
        };
        const [entry] = structuredDataHead(
            {
                ...page('guide/running.md'),
                frontmatter: { head: [['meta', { property: 'og:image', content: '/og/running.png' }]] }
            },
            { siteUrl, site: withIcon }
        );
        const parsed: unknown = JSON.parse(entry?.[2] ?? '');
        const graph = isRecord(parsed) && Array.isArray(parsed['@graph']) ? parsed['@graph'].filter(isRecord) : [];
        expect(node(graph, 'TechArticle').image).toBe(`${siteUrl}og/running.png`);
        expect(node(graph, 'Organization').logo).toBe(`${siteUrl}icon-180.png`);
        expect(site.logo).toBeUndefined();
    });
});
