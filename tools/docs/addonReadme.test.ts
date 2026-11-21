import { describe, expect, it } from 'vitest';

import { renderAddonReadme } from './addonReadme.mts';

const render = (markdown: string, community = true, screenshots = new Map<string, string>()) =>
    renderAddonReadme(markdown, {
        community,
        screenshots,
        resolveLink: (href) => new URL(href, 'https://github.com/acme/addons/blob/HEAD/addons/warps/').href
    });

describe('renderAddonReadme', () => {
    it('drops the first heading and shifts the rest so the shallowest is an h2', () => {
        expect(render('# Warps\n\nIntro.\n\n## Using it\n\n### Limits\n').html).toBe(
            '<p>Intro.</p>\n<h2 id="using-it">Using it</h2>\n<h3 id="limits">Limits</h3>\n'
        );
        expect(render('# Warps\n\n# Using it\n\n## Limits\n').html).toBe(
            '<h2 id="using-it">Using it</h2>\n<h3 id="limits">Limits</h3>\n'
        );
    });

    it('gives headings the ids VitePress gives them, so fragment links land', () => {
        const { html } = render(
            '# Warps\n\n[Usage](#usage), [FAQ](#faq--help) and [again](#usage-1).\n\n## Usage\n\n## FAQ & Help\n\n## Usage\n\n## 1.0 `café`\n'
        );

        expect(html).toContain('<a href="#usage" rel="ugc nofollow noopener">Usage</a>');
        expect(html).toContain('<a href="#faq-help" rel="ugc nofollow noopener">FAQ</a>');
        expect(html).toContain('<a href="#usage-1" rel="ugc nofollow noopener">again</a>');
        expect(html).toContain('<h2 id="usage">Usage</h2>');
        expect(html).toContain('<h2 id="faq-help">FAQ &amp; Help</h2>');
        expect(html).toContain('<h2 id="usage-1">Usage</h2>');
        expect(html).toContain('<h2 id="_1-0-cafe">1.0 <code>café</code></h2>');
    });

    it('escapes raw HTML and drops comments', () => {
        const { html } = render('# Warps\n\n<script>alert(1)</script>\n\n<!-- hidden -->\n\nText <b>bold</b>.\n');

        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>');
        expect(html).not.toContain('hidden');
        expect(html).toContain('&lt;script&gt;');
    });

    it('keeps comment syntax inside code spans and fenced code', () => {
        const { html } = render(
            'Type `<!--` to open a comment, then install it.\n\n```html\n<!-- a note -->\n<b>x</b>\n```\n'
        );

        expect(html).toContain('<code>&lt;!--</code> to open a comment, then install it.');
        expect(html).toContain('&lt;!-- a note --&gt;\n&lt;b&gt;x&lt;/b&gt;');
    });

    it('drops comments inline and as blocks, and keeps the text between them', () => {
        const { html } = render(
            'It needs <!-- fact:min -->0.23.0<!-- /fact --> or newer.\n\n<!-- fact:table -->\n| A |\n| - |\n| 1 |\n<!-- /fact -->\n\n<!-- fact:x -->**42**<!-- /fact -->\n'
        );

        expect(html).toContain('<p>It needs 0.23.0 or newer.</p>');
        expect(html).toContain('<td>1</td>');
        expect(html).toContain('<p><strong>42</strong></p>');
        expect(html).not.toContain('fact');
    });

    it('hides everything after an unclosed comment block, and escapes a comment that is not one', () => {
        expect(render('Shown.\n\n<!-- unclosed\n\nsecret\n').html).toBe('<p>Shown.</p>\n');
        // Removing the inner comment joins text that looks like one, which renders as text.
        const { html } = render('Text <!<!-- a -->-- joined --> here');
        expect(html).toBe('<p>Text &lt;!-- joined --&gt; here</p>\n');
    });

    it.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'data:text/html,hi',
        'vbscript:msgbox',
        'file:///etc/passwd'
    ])('renders a %s link as plain text', (href) => {
        const { html } = render(`[click](${href})`);

        expect(html).not.toContain('<a');
        expect(html).toContain('click');
    });

    it('keeps http, https, mailto and relative links, resolves relative ones and marks them user content', () => {
        const { html } = render('[a](https://x.test) [b](http://x.test) [c](mailto:a@x.test) [d](docs/use.md)');

        expect(html).toContain('<a href="https://x.test" rel="ugc nofollow noopener">a</a>');
        expect(html).toContain('<a href="http://x.test" rel="ugc nofollow noopener">b</a>');
        expect(html).toContain('<a href="mailto:a@x.test" rel="ugc nofollow noopener">c</a>');
        expect(html).toContain(
            '<a href="https://github.com/acme/addons/blob/HEAD/addons/warps/docs/use.md" rel="ugc nofollow noopener">d</a>'
        );
    });

    it('renders a relative link or image that does not resolve as its text', () => {
        const { html } = render('See [the guide](//) and ![a diagram](//).');

        expect(html).toBe('<p>See the guide and a diagram.</p>\n');
    });

    it('shows a listed screenshot from its pinned file and turns any other image into a link', () => {
        const pinned = new Map([['media/bar.png', '/addon-media/acme/addons/warps/screenshot-1.png']]);
        const { html, shown } = render(
            '![The bar](./media/bar.png)\n\n![Tracker](https://tracker.test/pixel.png)\n\n![Bad](javascript:x)',
            true,
            pinned
        );

        expect(html).toContain(
            '<img src="/addon-media/acme/addons/warps/screenshot-1.png" alt="The bar" loading="lazy">'
        );
        expect(html).not.toContain('<img src="https://tracker.test');
        expect(html).toContain('<a href="https://tracker.test/pixel.png" rel="ugc nofollow noopener">Tracker</a>');
        expect(html).not.toMatch(/(?:src|href)="javascript:/);
        expect([...shown]).toEqual(['media/bar.png']);
    });

    it.each([
        ['café.png', 'media/café.png'],
        ['caf%C3%A9.png', 'media/café.png'],
        ['café.png', 'media/café.png'.normalize('NFD')],
        ['café.png', 'media/caf%C3%A9.png']
    ])('matches the image %s to the screenshot %s', (image, file) => {
        const { html, shown } = render(`![Preview](media/${image})`, true, new Map([[file, '/addon-media/shot.png']]));

        expect(html).toBe('<p><img src="/addon-media/shot.png" alt="Preview" loading="lazy"></p>\n');
        expect([...shown]).toEqual([file]);
    });

    it('renders an unlisted image inside a link as its label, keeping the outer link', () => {
        const { html } = render('[![Build](https://img.test/badge.svg)](https://example.test/build)');

        expect(html).toBe('<p><a href="https://example.test/build" rel="ugc nofollow noopener">Build</a></p>\n');
    });

    it('leaves rel off JSPrismarine’s own README', () => {
        expect(render('[a](https://x.test)', false).html).toBe('<p><a href="https://x.test">a</a></p>\n');
    });
});
