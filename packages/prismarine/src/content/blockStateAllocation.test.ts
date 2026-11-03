import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildServerContent } from './ServerContent';

describe('resolved block state allocation', () => {
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

        // Captured from the complete pinned stack at the direct parent of the #2728 change.
        expect(digest).toBe('6694d4cfa8d680caba19e4ca8cc7cc26aa2900b30ab6dbb680b4aad56a900dac');
    });
});
