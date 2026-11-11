import { loadProject } from '../../project.mts';
import { overviewGroups } from './overviewGroups.mts';
import { prismSvg } from './theme/prism.ts';

/** Text for HTML: VitePress renders the footer message with `v-html`. */
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

interface FooterLink {
    href: string;
    text: string;
}

/**
 * The site footer as HTML: the mark, wordmark and server version on one side, and the links on the
 * other, one column per audience from the guide overview plus a Project column. The audiences come
 * from `overviewGroups.mts`, as the menu's and the sidebar's do, so the footer routes the same way.
 */
export function footerHtml({ base, project }: { base: string; project: FooterLink[] }) {
    const { version, license } = loadProject();
    const href = (link: string) => (/^https?:/.test(link) ? link : `${base}${link.replace(/^\//, '')}`);
    const column = (title: string, links: FooterLink[]) =>
        `<div class="site-footer__column"><p class="site-footer__heading">${escape(title)}</p>${links
            .map((link) => `<a href="${href(link.href)}">${escape(link.text)}</a>`)
            .join('')}</div>`;
    const audiences = overviewGroups('guide').map(({ text, items }) =>
        column(
            text,
            items.map((item) => ({ text: item.text, href: item.link }))
        )
    );
    return [
        '<div class="site-footer">',
        '<div class="site-footer__identity">',
        `<a class="site-footer__brand" href="${base}">${prismSvg()}<span>JSPrismarine</span></a>`,
        `<p class="site-footer__version">v${escape(version)} · Released under the ${escape(license)} license.</p>`,
        '</div>',
        `<nav class="site-footer__columns" aria-label="Site">${[...audiences, column('Project', project)].join('')}</nav>`,
        '</div>'
    ].join('');
}
