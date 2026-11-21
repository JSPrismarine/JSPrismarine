import { describe, expect, it } from 'vitest';

import { footerHtml } from './footer.mts';

describe('footerHtml', () => {
    it('holds only phrasing elements, so it stays inside the <p> VitePress renders it in', () => {
        const html = footerHtml({
            base: '/',
            audiences: [{ title: 'Run a server', links: [{ text: 'Install', href: '/guide/install' }] }],
            project: [{ text: 'Releases', href: '/releases' }]
        });
        // The mark is an inline <svg>, phrasing content itself; its shapes are SVG, not HTML.
        const outsideSvg = html.replaceAll(/<svg[\s\S]*?<\/svg>/g, '');
        const elements = new Set([...outsideSvg.matchAll(/<([a-z][a-z0-9-]*)/g)].map((match) => match[1]));

        expect(html).toContain('<svg');
        expect([...elements].sort()).toEqual(['a', 'span']);
    });
});
