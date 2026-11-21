import type { Plugin } from 'vite';

/** The size, in kB, past which a chunk of code is worth splitting: Vite's own default. */
export const chunkSizeLimitKb = 500;

/** A page's own chunk, which VitePress compiles from its Markdown, in full or lean. */
const pageChunk = /\.md(?:$|\?)/;

/** What the check reads of a chunk. */
export interface ChunkFacts {
    fileName: string;
    code: string;
    /** The module the chunk was built for: a page's Markdown file for its own chunk. */
    facadeModuleId: string | null;
}

/**
 * The warnings for the chunks of code over 500 kB, leaving out each page's own chunk.
 *
 * @param chunks - A client build's chunks.
 */
export function oversizedCode(chunks: Iterable<ChunkFacts>): string[] {
    return [...chunks].flatMap(({ fileName, code, facadeModuleId }) => {
        if (facadeModuleId && pageChunk.test(facadeModuleId)) return [];
        const kb = Buffer.byteLength(code) / 1000;
        return kb > chunkSizeLimitKb
            ? [
                  `${fileName} is ${Math.round(kb)} kB, over ${chunkSizeLimitKb} kB. Load what only some pages need with a dynamic import(), or move data a page does not show out of its data loader.`
              ]
            : [];
    });
}

/**
 * Vite's warning about chunks over 500 kB, for the code a page loads rather than the page itself.
 * Each page compiles to a chunk holding its content, and the generated API reference has module
 * pages of 1.8 MB, which splitting code cannot make smaller, so Vite's own check warned on every
 * build about pages and hid the chunk it can do something about. The theme, which every page loads,
 * is the one that matters: it once carried every release's notes for the landing page.
 */
export function codeChunkSize(): Plugin {
    let server = false;
    return {
        name: 'jsprismarine:code-chunk-size',
        apply: 'build',
        configResolved(config) {
            // VitePress builds the pages for the server as well; the client's chunks are the ones sent.
            server = Boolean(config.build.ssr);
        },
        generateBundle(_options, bundle) {
            if (server) return;
            const chunks = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? [output] : []));
            for (const warning of oversizedCode(chunks)) this.warn(warning);
        }
    };
}
