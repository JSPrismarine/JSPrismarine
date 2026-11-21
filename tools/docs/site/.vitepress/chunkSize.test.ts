import { describe, expect, it } from 'vitest';

import { type ChunkFacts, oversizedCode } from './chunkSize.ts';

/** A chunk of the given size in kB, built for the given module. */
const chunk = (fileName: string, kb: number, facadeModuleId: string | null = null): ChunkFacts => ({
    fileName,
    code: 'x'.repeat(kb * 1000),
    facadeModuleId
});

describe('oversizedCode', () => {
    it('warns about code over 500 kB, such as a theme that carries data no page needs', () => {
        expect(oversizedCode([chunk('assets/chunks/theme.js', 761, '/site/.vitepress/theme/index.ts')])).toEqual([
            expect.stringMatching(/^assets\/chunks\/theme\.js is 761 kB/)
        ]);
    });

    it("leaves out a page's own chunk, whose size is its content, and code under the limit", () => {
        expect(
            oversizedCode([
                chunk('assets/api_protocol_index.md.js', 1805, '/site/api/@jsprismarine/protocol/index.md'),
                chunk('assets/api_protocol_index.md.lean.js', 900, '/site/api/@jsprismarine/protocol/index.md?lean'),
                chunk('assets/chunks/framework.js', 245)
            ])
        ).toEqual([]);
    });
});
