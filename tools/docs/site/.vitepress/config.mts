import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type DefaultTheme, defineConfig, type HeadConfig } from 'vitepress';
import manifest from '../../../../package.json' with { type: 'json' };
import typedocSidebar from '../api/typedoc-sidebar.json' with { type: 'json' };
import { footerHtml } from './footer.mts';
import { languages } from './languages.ts';
import { megaMenus } from './menus.mts';
import { overviewGroups } from './overviewGroups.mts';
import { siteIconHead } from '../../brand-assets.mts';
import { markdownHeaders, markdownPages, writeLlmsFiles, writeMarkdownPages } from '../../llms.mts';
import { loadGeneratedCopies } from '../../llmsPages.mts';
import { loadProject } from '../../project.mts';
import { isStagedPage, pageSource, pageUrl, sections, sourceUpdatedAt } from '../../sections.mts';
import { structuredDataHead } from '../../structuredData.mts';
import { colorSwatchPlugin, colorSwatchTransformer } from './colorSwatches.ts';
import { sidebar } from './sidebar.mts';
import { wordmark } from './theme/prism.ts';
import { pageDescriptions } from './pageDescriptions.ts';
import { cardPages, sectionCardsPlugin } from './sectionCards.ts';
import { codeChunkSize } from './chunkSize.ts';
import { codeTheme } from './theme/codeTheme.ts';
import { packageAreas } from './theme/packageAreas.ts';
import { palette, paletteCss } from './theme/tokens.ts';
import { checkImageFiles, imageTags, landingPage } from './og/cardImage.ts';
import type { CardRequest } from './og/cardContent.ts';
import { loadCardContext } from './og/cardContext.ts';
import { resolvePageImage } from './og/pageCards.ts';
import { versionCardLinks, writeCards } from './og/renderCards.ts';

const repositoryUrl = manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
// The root manifest's homepage is where Cloudflare Pages publishes the site.
const siteUrl = manifest.homepage;
// A pull request's preview is this same build at an address of its own, so it shares the site's base
// path, and its canonical and Open Graph URLs point at the published site.
const base = new URL(siteUrl).pathname;
// The README's Discord badge is the one place the invite is written.
const discordInvite = /\]\((https:\/\/discord\.gg\/[\w-]+)\)/.exec(
    readFileSync(new URL('../../../../README.md', import.meta.url), 'utf8')
)?.[1];

/**
 * The API reference sidebar: TypeDoc's package entries without the shared scope, grouped by the areas
 * the package directory uses, so both pages sort packages the same way.
 */
function apiSidebar() {
    const entries = new Map(typedocSidebar.map((entry) => [entry.text.replace(/^@[^/]+\//, ''), entry]));
    const grouped = packageAreas.map((area) => ({
        text: area.title,
        items: area.packages.flatMap((name) => {
            const entry = entries.get(name);
            return entry ? [{ ...entry, text: name }] : [];
        })
    }));
    // A package TypeDoc documents but no area lists still gets a place, rather than vanishing.
    const placed = new Set<string>(packageAreas.flatMap((area) => area.packages));
    const rest = [...entries].filter(([name]) => !placed.has(name)).map(([name, entry]) => ({ ...entry, text: name }));
    return rest.length ? [...grouped, { text: 'Other', items: rest }] : grouped;
}

/** A mega menu section's link groups as a sidebar, for root pages that have no docs folder of their own. */
function menuSidebar(section: string) {
    const menu = megaMenus.find(({ text }) => text === section);
    if (!menu) throw new Error(`The site menu has no ${section} section for a page sidebar.`);
    return menu.sections.map((group) => ({
        text: group.text,
        items: group.items.map(({ text, link }) => ({ text, link }))
    }));
}

let copies: ReadonlyMap<string, string> | undefined;
/**
 * The Markdown copies written from data for the pages built with components, read once: the head of
 * each page links its copy, and `buildEnd` publishes them.
 */
const generatedCopies = (srcDir: string) => (copies ??= loadGeneratedCopies(srcDir, loadProject()));

/** Every link in a sidebar, nested groups included, in the order the sidebar shows them. */
function sidebarLinks(items: readonly DefaultTheme.SidebarItem[]): string[] {
    return items.flatMap((item) => [...(item.link ? [item.link] : []), ...sidebarLinks(item.items ?? [])]);
}

/**
 * The link preview card each page asked for, by source file, gathered as VitePress transforms the
 * pages and rendered once at the end of the build.
 */
const cardRequests = new Map<string, CardRequest>();

/** The site file each page's `image` front matter names, by source file, checked once the site is built. */
const imageFiles = new Map<string, string>();

/** Each page's description when its front matter gives none, worked out for every page at once by the first page. */
let descriptions: Map<string, string> | undefined;

export default defineConfig({
    lang: 'en-US',
    title: wordmark,
    // The landing page's description, and every page's when it has none of its own.
    description: manifest.description,
    base,
    head: [
        ['style', {}, paletteCss],
        // `docs:icons` writes these files into the public folder before VitePress starts.
        ...siteIconHead(base),
        ['meta', { name: 'theme-color', content: palette.forest.hex }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:site_name', content: wordmark }],
        // Every page has a wide preview image: its own card, or the landing page's.
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
        ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
        [
            'link',
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=JetBrains+Mono:wght@400;700&display=swap'
            }
        ]
    ],
    lastUpdated: true,
    // Cloudflare Pages redirects `/page.html` to `/page`, so links and sitemap entries name the clean
    // path, the one a page's canonical URL already gives.
    cleanUrls: true,
    async buildEnd(siteConfig) {
        checkImageFiles(imageFiles, siteConfig.outDir);
        const cards = await writeCards(cardRequests.values(), {
            context: await loadCardContext(siteConfig.srcDir, siteConfig.pages),
            outDir: siteConfig.outDir,
            cacheDir: path.join(siteConfig.cacheDir, 'og')
        });
        const linking = await versionCardLinks(siteConfig.outDir, cards.versions, siteUrl);
        console.log(
            `Link preview cards: ${cards.rendered} rendered, ${cards.reused} unchanged since the last build, ${cards.bytes} bytes, linked from ${linking} pages.`
        );
        const project = loadProject();
        const site = {
            srcDir: siteConfig.srcDir,
            outDir: siteConfig.outDir,
            pages: siteConfig.pages,
            siteUrl,
            generated: generatedCopies(siteConfig.srcDir)
        };
        const markdownPages = writeMarkdownPages(site);
        console.log(`Markdown copies: ${markdownPages} pages.`);
        const llms = writeLlmsFiles({
            ...site,
            summary: manifest.description,
            project,
            sections,
            // The sidebar is each section's page order, and a card page's groups are its sections.
            sectionLinks: (section) => sidebarLinks(sidebar[`/${section.dir}/`] ?? []),
            overviewGroups: (section) =>
                cardPages.has(`${section.dir}/index.md`) ? overviewGroups(section.dir) : undefined,
            updatedAt: sourceUpdatedAt
        });
        console.log(`llms.txt: ${llms.links} links; llms-full.txt: ${llms.fullTextBytes} bytes.`);
        // Crawlers find the sitemap through robots.txt. Cloudflare adds its managed content signals to
        // the file it serves.
        writeFileSync(
            path.join(siteConfig.outDir, 'robots.txt'),
            ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap.xml', siteUrl).href}`, ''].join('\n')
        );
        // Cloudflare Pages also serves every upload on pages.dev: the project's own address, each pull
        // request's `pr-<n>` preview and each deployment's hash address. Search engines index only the
        // published domain. Cloudflare marks some previews `noindex` by itself, but not the project
        // address or a production deployment's hash address.
        writeFileSync(
            path.join(siteConfig.outDir, '_headers'),
            [
                'https://:project.pages.dev/*',
                '  X-Robots-Tag: noindex',
                '',
                'https://:deployment.:project.pages.dev/*',
                '  X-Robots-Tag: noindex',
                '',
                ...markdownHeaders
            ].join('\n')
        );
    },
    sitemap: { hostname: siteUrl },
    /** Per-page Open Graph title, description, URL and image, so shared links preview the page itself. */
    transformPageData(pageData, { siteConfig }) {
        // VitePress gives a page without a title or description an empty string, which `??` would keep.
        const title = pageData.frontmatter.title || pageData.title || siteConfig.site.title;
        const ownDescription =
            pageData.frontmatter.description ||
            pageData.description ||
            // The landing page speaks for the site, so its description is the site's.
            (pageData.relativePath === landingPage ? siteConfig.site.description : undefined);
        // A page without one is described by its own opening sentence rather than the site's description,
        // which search engines would otherwise see repeated on every such page.
        descriptions ??= pageDescriptions(siteConfig.pages, {
            project: loadProject(),
            menus: megaMenus,
            source: (relativePath) => readFileSync(path.join(siteConfig.srcDir, relativePath), 'utf8')
        });
        const description = ownDescription ?? descriptions.get(pageData.relativePath) ?? siteConfig.site.description;
        // VitePress writes the page's `<meta name="description">` from this.
        pageData.description = description;
        const url = pageUrl(pageData.relativePath, siteUrl);
        // A card shows only a description of the page's own, never the site's in its place.
        const { image, card, file } = resolvePageImage(pageData, { title, description: ownDescription, siteUrl });
        if (card) cardRequests.set(pageData.relativePath, card);
        if (file) imageFiles.set(pageData.relativePath, file);
        pageData.frontmatter.head ??= [];
        pageData.frontmatter.head.push(
            ['meta', { property: 'og:title', content: title }],
            ['meta', { property: 'og:description', content: description }],
            ['meta', { property: 'og:url', content: url }],
            ['link', { rel: 'canonical', href: url }],
            // A page with a Markdown copy (see `llms.mts`) names it, so a tool reading the HTML can fetch the text.
            ...(markdownPages({ pages: [pageData.relativePath], generated: generatedCopies(siteConfig.srcDir) }).size
                ? [
                      [
                          'link',
                          {
                              rel: 'alternate',
                              type: 'text/markdown',
                              href: new URL(pageData.relativePath, siteUrl).href
                          }
                      ] satisfies HeadConfig
                  ]
                : []),
            ...imageTags(image)
        );
        // VitePress serializes theme config functions into the client bundle, so the edit link is resolved
        // here at build time and read by the theme's EditSource component.
        // The copy's own git date is meaningless, so date the page by the source it was built from.
        const updatedAt = sourceUpdatedAt(pageData.relativePath);
        if (updatedAt) pageData.lastUpdated = updatedAt;
        // The API index's per-area tables share a column width under this class.
        if (pageData.relativePath === 'api/index.md') pageData.frontmatter.pageClass = 'api-index';
        const source = pageSource(pageData.relativePath);
        pageData.frontmatter.editSource = {
            kind: source.kind,
            url: `${repositoryUrl}/${source.kind === 'file' ? 'edit' : 'tree'}/master/${source.path}`
        };
        // Last, so the JSON-LD reads the finished head and date.
        const { relativePath, lastUpdated, frontmatter } = pageData;
        const page = { relativePath, url, title, description, lastUpdated, frontmatter };
        frontmatter.head.push(...structuredDataHead(page, { siteUrl, discordInvite, site: siteConfig.site }));
    },
    vite: {
        // Vite's check counts each page's own chunk, which holds its content; codeChunkSize checks the rest.
        build: { chunkSizeWarningLimit: Number.POSITIVE_INFINITY },
        plugins: [codeChunkSize()]
    },
    ignoreDeadLinks: [
        (link, source) => {
            console.warn(`Found dead link ${link} in ${source}`);
            return true;
        }
    ],
    markdown: {
        languages,
        // Code sits on the terminal's ink surface in both color modes.
        theme: { light: codeTheme, dark: codeTheme },
        codeTransformers: [colorSwatchTransformer],
        config(md) {
            md.use(colorSwatchPlugin);
            md.use(sectionCardsPlugin);
            // The staged docs are written for GitHub. Vue would compile their `{{` and bare `<tag>` text as
            // template syntax, so these pages render as literal markdown.
            const render = md.render.bind(md);
            md.render = (source, env) => {
                const staged = isStagedPage(env?.relativePath ?? '');
                md.set({ html: !staged });
                if (!staged) return render(source, env);
                // Front matter has to stay first, or it renders as a heading inside the container.
                const [frontMatter = ''] = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source) ?? [];
                return render(`${frontMatter}::: v-pre\n${source.slice(frontMatter.length)}\n:::`, env);
            };
        }
    },
    themeConfig: {
        megaMenus,
        // Every API entry is a package in the one scope, so the sidebar names packages without it.
        sidebar: {
            ...sidebar,
            // Root pages take their menu section's groups as a sidebar, so every doc page shares one column.
            '/packages': menuSidebar('Build'),
            '/parity': menuSidebar('Project'),
            '/benchmarks': menuSidebar('Project'),
            '/releases': menuSidebar('Project'),
            '/brand-kit': menuSidebar('Project'),
            '/api/': apiSidebar()
        },
        socialLinks: [
            { icon: 'github', link: repositoryUrl },
            ...(discordInvite ? [{ icon: 'discord', link: discordInvite }] : [])
        ],
        // The site menu's own search replaces VitePress's; its sidebar button is renamed so phones show
        // one Menu button.
        sidebarMenuLabel: 'Pages',
        lastUpdated: { text: 'Updated', formatOptions: { dateStyle: 'medium' } },
        // VitePress renders the footer message as HTML, so site paths carry the deploy base themselves.
        footer: {
            message: footerHtml({
                base,
                audiences: overviewGroups('guide').map(({ text, items }) => ({
                    title: text,
                    links: items.map((item) => ({ text: item.text, href: item.link }))
                })),
                project: [
                    { text: 'Parity tracker', href: '/parity' },
                    { text: 'Benchmarks', href: '/benchmarks' },
                    { text: 'Packages', href: '/packages' },
                    { text: 'Releases', href: '/releases' },
                    { text: 'Brand kit', href: '/brand-kit' },
                    // The site's pages as Markdown, for language models and the tools built on them.
                    { text: 'llms.txt', href: '/llms.txt' },
                    { text: 'GitHub', href: repositoryUrl },
                    ...(discordInvite ? [{ text: 'Discord', href: discordInvite }] : [])
                ]
            })
        }
    }
});
