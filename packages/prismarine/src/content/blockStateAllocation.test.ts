import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildServerContent } from './ServerContent';

// The digest covers the complete pinned stack, Java tags and all, which only the real-data jobs
// have; the unit job builds the content without them and gets another digest.
describe('resolved block state allocation', { tags: ['real-data'] }, () => {
    it('keeps the vanilla state digest unchanged', () => {
        const states = buildServerContent().blocks.states.map(
            ({ runtimeId, values, permutations, tags, javaTags, content }) => ({
                runtimeId,
                values,
                permutations,
                tags,
                javaTags,
                flags: content.flags
            })
        );
        const digest = createHash('sha256').update(JSON.stringify(states)).digest('hex');

        // Captured from the complete pinned stack. Re-captured when the block families took over
        // the lamp, sponge, concrete powder, cactus and button rules, which changed their flags.
        expect(digest).toBe('84675b6a2cdfe41cd461b734908ec3babcd3529d064ec89e0174f40da4b12ca6');
    });
});
