/**
 * Renders an addon's README for its marketplace page. A community addon's README is someone
 * else's text, so it renders as data:
 *
 * - Raw HTML renders as escaped text, and HTML comments are dropped, as GitHub hides them. Code
 *   spans and fenced code keep their text, comment syntax included.
 * - Only relative, `http:`, `https:` and `mailto:` links stay links; any other scheme renders as
 *   plain text. A community README's links get `rel="ugc nofollow noopener"`.
 * - An image shows only when it is one of the addon's listed screenshots, from the file the
 *   snapshot pinned. Any other image becomes a link to it.
 * - The first heading is dropped, since the page's title replaces it, and the rest shift so the
 *   shallowest is an `h2` under the page's `h1`. Each heading gets the id VitePress would give it,
 *   and a `#fragment` link is slugged the same way, so the README's section links land.
 *
 * The HTML goes into the page through `v-html`, never through the Markdown compiler, so the
 * README's text cannot reach Vue's templates.
 */

import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

/** Options for {@link renderAddonReadme}. */
export interface AddonReadmeOptions {
    /** Whether the README is another repository's, whose links get `rel="ugc nofollow noopener"`. */
    readonly community: boolean;
    /** Where each listed screenshot shows from, by its path in the addon's folder, such as `media/bar.png`. */
    readonly screenshots: ReadonlyMap<string, string>;
    /** Turns a relative link into the URL it opens. */
    readonly resolveLink: (href: string) => string;
}

/** A rendered README and the screenshots it showed itself, by their path in the addon's folder. */
export interface RenderedReadme {
    readonly html: string;
    readonly shown: ReadonlySet<string>;
}

/** The schemes a README's links may use. A link with none is relative. */
const SAFE_LINK = /^(?:https?:|mailto:|#|[^:]*$)/i;

/** A path in the addon's folder without `./`, so `./media/a.png` and `media/a.png` match. */
const folderPath = (href: string): string => href.replace(/^(?:\.\/)+/, '');

/**
 * The key a screenshot path and an image destination share. Markdown-it percent-encodes a
 * destination's non-ASCII characters, so `café.png` arrives as `caf%C3%A9.png`; both sides decode,
 * then compose to NFC so a decomposed `é` matches too.
 */
const imageKey = (href: string): string => {
    const path = folderPath(href);
    try {
        return decodeURI(path).normalize('NFC');
    } catch {
        return path.normalize('NFC');
    }
};

const isRelative = (href: string): boolean => !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#');

/*
 * VitePress gives a heading the id from `@mdit-vue/shared`'s `slugify`, which it bundles rather
 * than exports, unless the site's `markdown.anchor.slugify` replaces it; ours does not.
 */
const SLUG_CONTROL = /[\u0000-\u001f]/g;
const SLUG_SPECIAL = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;

/** Drops a combining diacritical mark (U+0300 to U+036F), such as the accent NFKD splits from `é`. */
const dropDiacritic = (mark: string): string => {
    const code = mark.codePointAt(0) ?? 0;
    return code >= 0x300 && code <= 0x36f ? '' : mark;
};

/** The heading id VitePress derives from a heading's text. */
const slugify = (text: string): string =>
    text
        .normalize('NFKD')
        .replace(/\p{M}/gu, dropDiacritic)
        .replace(SLUG_CONTROL, '')
        .replace(SLUG_SPECIAL, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/^(\d)/, '_$1')
        .toLowerCase();

/** A `#fragment` link slugged as VitePress slugs one in its own pages, so it matches a heading id. */
const slugFragment = (href: string): string => {
    try {
        return encodeURI(`#${slugify(decodeURI(href.slice(1)))}`);
    } catch {
        return href;
    }
};

/**
 * Removes HTML comments from raw HTML, an unclosed one with everything after it. It scans rather
 * than matching a pattern, and the text it returns still renders escaped.
 */
const removeComments = (html: string): string => {
    let kept = '';
    let from = 0;
    for (;;) {
        const start = html.indexOf('<!--', from);
        if (start === -1) return kept + html.slice(from);
        kept += html.slice(from, start);
        // `<!-->` and `<!--->` are complete comments, so the close may overlap the open.
        const end = html.indexOf('-->', start + 2);
        if (end === -1) return kept;
        from = end + 3;
    }
};

/** Renders a README as {@link AddonReadmeOptions} describes. */
export function renderAddonReadme(markdown: string, options: AddonReadmeOptions): RenderedReadme {
    // HTML parses so comments become tokens, which never span code; the rest renders escaped below.
    const md = new MarkdownIt({ html: true, linkify: true });
    md.validateLink = (url) => SAFE_LINK.test(url.trim());
    const shown = new Set<string>();
    const { Token } = new md.core.State('', md, {});
    const screenshots = new Map([...options.screenshots].map(([file, src]) => [imageKey(file), { file, src }]));

    const text = (content: string): Token => {
        const token = new Token('text', '', 0);
        token.content = content;
        return token;
    };

    /** The README's tokens with comments dropped and any other raw HTML turned into text. */
    const parse = (source: string): Token[] =>
        md.parse(source, {}).flatMap((token) => {
            if (token.type === 'html_block') {
                const rest = removeComments(token.content);
                // A block without a comment shows as text, as raw HTML does with `html` off.
                if (rest === token.content) {
                    const inline = new Token('inline', '', 0);
                    inline.children = [text(rest.trimEnd())];
                    const open = new Token('paragraph_open', 'p', 1);
                    const close = new Token('paragraph_close', 'p', -1);
                    open.block = close.block = true;
                    return [open, inline, close];
                }
                // Whatever the comments surrounded is Markdown again; it is shorter, so this ends.
                return rest.trim() === '' ? [] : parse(rest);
            }
            if (token.type === 'inline' && token.children) {
                token.children = token.children.flatMap((child) => {
                    if (child.type !== 'html_inline') return [child];
                    return child.content.startsWith('<!--') ? [] : [text(child.content)];
                });
            }
            return [token];
        });

    const tokens = parse(markdown);
    // Drop the first heading, then shift the rest so the shallowest is an h2.
    const first = tokens.findIndex((token) => token.type === 'heading_open');
    if (first !== -1) tokens.splice(first, 3);
    const levels = tokens.filter((token) => token.type === 'heading_open').map((token) => Number(token.tag.slice(1)));
    const shift = levels.length === 0 ? 0 : 2 - Math.min(...levels);
    // Ids repeat with a `-1`, `-2` suffix, as markdown-it-anchor numbers them for VitePress.
    const ids = new Set<string>();
    for (const [i, token] of tokens.entries()) {
        if (token.type !== 'heading_open' && token.type !== 'heading_close') continue;
        token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + shift)}`;
        if (token.type === 'heading_close') continue;
        const title = (tokens[i + 1]?.children ?? []).map((child) => child.content).join('');
        const slug = slugify(title);
        let id = slug;
        for (let n = 1; ids.has(id); n++) id = `${slug}-${n}`;
        ids.add(id);
        token.attrSet('id', id);
    }

    /** Where a link opens, or undefined when it is relative and does not resolve, such as `//`. */
    const target = (href: string): string | undefined => {
        if (href.startsWith('#')) return slugFragment(href);
        if (!isRelative(href)) return href;
        try {
            return options.resolveLink(href);
        } catch {
            return undefined;
        }
    };

    for (const token of tokens) {
        if (token.type !== 'inline' || !token.children) continue;
        const children = [];
        // Links do not nest, so a close belongs to the open before it.
        let dropClose = false;
        let inLink = false;
        for (const child of token.children) {
            if (child.type === 'link_open') {
                const href = target(child.attrGet('href') ?? '');
                // A link that does not resolve keeps its label as text.
                if (href === undefined) {
                    dropClose = true;
                    continue;
                }
                child.attrSet('href', href);
                if (options.community) child.attrSet('rel', 'ugc nofollow noopener');
                children.push(child);
                inLink = true;
                continue;
            }
            if (child.type === 'link_close') {
                inLink = false;
                if (dropClose) {
                    dropClose = false;
                    continue;
                }
            }
            if (child.type !== 'image') {
                children.push(child);
                continue;
            }
            const src = child.attrGet('src') ?? '';
            const label = text(child.content || src);
            const pinned = isRelative(src) ? screenshots.get(imageKey(src)) : undefined;
            if (pinned !== undefined) {
                shown.add(pinned.file);
                child.attrSet('src', pinned.src);
                child.attrSet('loading', 'lazy');
                children.push(child);
                continue;
            }
            // Any other image is a link to it, so the page loads nothing the snapshot did not pin.
            // Inside a link it is its label alone, since a link cannot hold another.
            const href = !inLink && md.validateLink(src) ? target(src) : undefined;
            if (href === undefined) {
                children.push(label);
                continue;
            }
            const open = new Token('link_open', 'a', 1);
            open.attrSet('href', href);
            if (options.community) open.attrSet('rel', 'ugc nofollow noopener');
            children.push(open, label, new Token('link_close', 'a', -1));
        }
        token.children = children;
    }

    return { html: md.renderer.render(tokens, md.options, {}), shown };
}
