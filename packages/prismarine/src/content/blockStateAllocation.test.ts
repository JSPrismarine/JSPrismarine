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

        // The previous literal came from a stale pack-stack snapshot; this is the pre-optimization output here.
        expect(digest).toBe('658e550f96956261b4256594eb8e24901ef0c90f49ce0bc9e68ca92a6d0f171a');
    });
});
