import type { MarkdownOptions } from 'vitepress';

type MarkdownIt = Parameters<NonNullable<MarkdownOptions['config']>>[0];
type Token = ReturnType<MarkdownIt['parse']>[number];

/**
 * Overview pages whose second-level sections are short lists of links. Each section renders as a card
 * in a grid, so the page reads as a set of starting points instead of a long list.
 */
const cardPages: ReadonlySet<string> = new Set(['guide/index.md']);

/** Wraps every second-level section of a card page in a `doc-card` section inside one `doc-cards` grid. */
export function sectionCardsPlugin(md: MarkdownIt) {
    md.core.ruler.push('jsprismarine:section-cards', (state) => {
        const relativePath: unknown = state.env?.relativePath;
        if (typeof relativePath !== 'string' || !cardPages.has(relativePath)) return;
        const html = (content: string) => {
            const token = new state.Token('html_block', '', 0);
            token.content = content;
            return token;
        };
        const tokens: Token[] = [];
        let open = false;
        for (const token of state.tokens) {
            if (token.type === 'heading_open' && token.tag === 'h2') {
                tokens.push(
                    html(
                        open
                            ? '</section>\n<section class="doc-card">\n'
                            : '<div class="doc-cards">\n<section class="doc-card">\n'
                    )
                );
                open = true;
            } else if (open && token.type === 'heading_open' && token.tag === 'h1') {
                tokens.push(html('</section>\n</div>\n'));
                open = false;
            } else if (open && token.type === 'container_v-pre_close') {
                // Staged pages are wrapped in a v-pre container; the grid closes inside it.
                tokens.push(html('</section>\n</div>\n'));
                open = false;
            }
            tokens.push(token);
        }
        if (open) tokens.push(html('</section>\n</div>\n'));
        state.tokens = tokens;
    });
}
