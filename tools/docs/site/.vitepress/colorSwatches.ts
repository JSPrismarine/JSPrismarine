import type { MarkdownOptions } from 'vitepress';

type MarkdownIt = Parameters<NonNullable<MarkdownOptions['config']>>[0];
type CodeTransformer = NonNullable<MarkdownOptions['codeTransformers']>[number];

/**
 * A hex color: 3, 4, 6 or 8 digits. A 3 or 4 digit value needs a letter, so `#123` (an issue or pull
 * request number) is left alone while `#fff` and `#0f0a` still match.
 */
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|(?=[0-9a-f]{0,3}[a-f])[0-9a-f]{3,4})(?![0-9a-z_-])/gi;
const WHOLE_HEX = new RegExp(`^${HEX.source}$`, 'i');

/** The swatch's markup. The color is validated by `HEX`, so it is safe inside the attribute. */
const swatchHtml = (color: string) =>
    `<span class="color-swatch" style="--swatch: ${color}" aria-hidden="true"></span>`;

/** Puts a swatch inside inline code that is exactly one hex color, such as `#5ca48a`. */
export function colorSwatchPlugin(md: MarkdownIt) {
    const render = md.renderer.rules.code_inline;
    md.renderer.rules.code_inline = (tokens, index, options, env, self) => {
        const html = render ? render(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
        const color = tokens[index].content.trim();
        // Inside the code element, so the chip sits in the code pill beside the value.
        return WHOLE_HEX.test(color) ? html.replace(/^(<code[^>]*>)/, `$1${swatchHtml(color)}`) : html;
    };
}

/** Puts a swatch before each hex color inside a highlighted code block. */
export const colorSwatchTransformer: CodeTransformer = {
    name: 'jsprismarine:color-swatches',
    span(node) {
        const [text] = node.children;
        if (node.children.length !== 1 || text?.type !== 'text' || text.value.search(HEX) === -1) return;
        const parts: typeof node.children = [];
        let last = 0;
        for (const match of text.value.matchAll(HEX)) {
            if (match.index > last) parts.push({ type: 'text', value: text.value.slice(last, match.index) });
            parts.push({
                type: 'element',
                tagName: 'span',
                properties: { class: 'color-swatch', style: `--swatch: ${match[0]}`, 'aria-hidden': 'true' },
                children: []
            });
            parts.push({ type: 'text', value: match[0] });
            last = match.index + match[0].length;
        }
        if (last < text.value.length) parts.push({ type: 'text', value: text.value.slice(last) });
        node.children = parts;
    }
};
