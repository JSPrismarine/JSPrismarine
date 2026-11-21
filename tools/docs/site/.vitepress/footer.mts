import { execFileSync } from 'node:child_process';
import { loadProject, repoRoot } from '../../project.mts';
import { prismSvg, wordmark } from './theme/prism.ts';

/** Text for HTML: VitePress renders the footer message with `v-html`. */
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** The commit the site is built from, or undefined in a checkout without git. */
function builtCommit() {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch {
        return undefined;
    }
}

interface FooterLink {
    href: string;
    text: string;
}

/** One column of footer links under its heading. */
export interface FooterColumn {
    title: string;
    links: FooterLink[];
}

/**
 * The site footer as HTML: the mark, wordmark, server version and built commit on one side, and the links on the
 * other, one column per audience plus a Project column. The config takes the audiences from
 * `overviewGroups.mts`, as the menu's and the sidebar's do, so the footer routes the same way.
 *
 * VitePress puts the message inside a `<p>`, which holds only phrasing content, so every element
 * here is a `<span>` that `brand.css` lays out as a block. A `<div>` would close the `<p>` while the
 * browser parses the page, and the page would no longer match what Vue hydrates (#3345).
 */
export function footerHtml({
    base,
    audiences,
    project
}: {
    base: string;
    audiences: FooterColumn[];
    project: FooterLink[];
}) {
    const { version, licenses, repositoryUrl } = loadProject();
    const commit = builtCommit();
    const href = (link: string) => (/^https?:/.test(link) ? link : `${base}${link.replace(/^\//, '')}`);
    const column = (title: string, links: FooterLink[]) =>
        `<span class="site-footer__column"><span class="site-footer__heading">${escape(title)}</span>${links
            .map((link) => `<a href="${href(link.href)}">${escape(link.text)}</a>`)
            .join('')}</span>`;
    return [
        '<span class="site-footer">',
        '<span class="site-footer__identity">',
        `<a class="site-footer__brand" href="${base}">${prismSvg()}<span>${escape(wordmark)}</span></a>`,
        `<span class="site-footer__version">v${escape(version)} · ${
            commit ? `Built from <a href="${repositoryUrl}/commit/${commit}">${commit.slice(0, 7)}</a> · ` : ''
        }Released under the ${escape(licenses.join(' or '))} license, at your option.</span>`,
        '</span>',
        `<span class="site-footer__columns" role="navigation" aria-label="Site">${[
            ...audiences.map(({ title, links }) => column(title, links)),
            column('Project', project)
        ].join('')}</span>`,
        '</span>'
    ].join('');
}
