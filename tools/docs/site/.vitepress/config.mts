import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';
import manifest from '../../../../package.json' with { type: 'json' };
import mcfunction from './mcfunction.tmLanguage.json';
import molang from './molang.tmLanguage.json';
import typedocSidebar from '../api/typedoc-sidebar.json';
import { footerHtml } from './footer.mts';
import { megaMenus } from './menus.mts';
import { isStagedPage, pageSource, sourceUpdatedAt } from '../../sections.mts';
import { colorSwatchPlugin, colorSwatchTransformer } from './colorSwatches.ts';
import { sidebar } from './sidebar.mts';
import { prismSvg } from './theme/prism.ts';
import { sectionCardsPlugin } from './sectionCards.ts';
import { codeTheme } from './theme/codeTheme.ts';
import { packageAreas } from './theme/packageAreas.ts';
import { palette, paletteCss } from './theme/tokens.ts';

const repositoryUrl = manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
// The root manifest's homepage is where the site is published, on a custom GitHub Pages domain.
const siteUrl = manifest.homepage;
// The docs workflow builds a pull request's preview for a folder under the site, such as `pr-preview/pr-12`.
// Canonical and Open Graph URLs keep pointing at the published site.
const previewPath = process.env.DOCS_PREVIEW_PATH?.replace(/^\/+|\/+$/g, '');
const base = `${new URL(siteUrl).pathname}${previewPath ? `${previewPath}/` : ''}`;
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

export default defineConfig({
    lang: 'en-US',
    title: 'JSPrismarine',
    description: 'Dedicated Minecraft Bedrock Edition server written in TypeScript',
    base,
    head: [
        ['style', {}, paletteCss],
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `data:image/svg+xml,${encodeURIComponent(prismSvg())}` }],
        ['meta', { name: 'theme-color', content: palette.forest.hex }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:site_name', content: 'JSPrismarine' }],
        ['meta', { name: 'twitter:card', content: 'summary' }],
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
    /** GitHub Pages serves the site's custom domain from a `CNAME` file at the branch root, which a preview is not. */
    buildEnd(siteConfig) {
        if (!previewPath) writeFileSync(path.join(siteConfig.outDir, 'CNAME'), `${new URL(siteUrl).hostname}\n`);
    },
    sitemap: { hostname: siteUrl },
    /** Per-page Open Graph title, description and URL, so shared links preview the page itself. */
    transformPageData(pageData, { siteConfig }) {
        const title = pageData.frontmatter.title ?? pageData.title ?? siteConfig.site.title;
        const description = pageData.frontmatter.description ?? pageData.description ?? siteConfig.site.description;
        const url = new URL(pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, ''), siteUrl).href;
        pageData.frontmatter.head ??= [];
        pageData.frontmatter.head.push(
            ['meta', { property: 'og:title', content: title }],
            ['meta', { property: 'og:description', content: description }],
            ['meta', { property: 'og:url', content: url }],
            ['link', { rel: 'canonical', href: url }]
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
    },
    ignoreDeadLinks: [
        (link, source) => {
            console.warn(`Found dead link ${link} in ${source}`);
            return true;
        }
    ],
    markdown: {
        // Shiki ships no grammar for mcfunction or Molang, so their fences fall
        // back to plain text; register the local ones.
        languages: [mcfunction, molang],
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
                project: [
                    { text: 'Parity tracker', href: '/parity' },
                    { text: 'Packages', href: '/packages' },
                    { text: 'Releases', href: '/releases' },
                    { text: 'Brand kit', href: '/brand-kit' },
                    { text: 'GitHub', href: repositoryUrl },
                    ...(discordInvite ? [{ text: 'Discord', href: discordInvite }] : [])
                ]
            })
        }
    }
});
