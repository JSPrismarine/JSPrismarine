import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildServerContent } from './ServerContent';

// The digest covers the complete pinned stack, Java tags and all, which only the real-data jobs
// have. A build without them gets another digest: the cause of #3062, where the unit job ran this
// file before it carried the tag.
describe('resolved block state allocation', { tags: ['real-data'] }, () => {
    // Building the whole vanilla stack takes most of the default 20 s budget on its own.
    it('keeps the vanilla state digest unchanged', { timeout: 60_000 }, () => {
        const built = buildServerContent();

        // A missing pack member changes the digest too, so name it instead of reporting a mismatch.
        const missing = built.diagnostics.filter(({ code }) => code === 'pack.missing').map(({ message }) => message);
        expect(missing, 'the digest needs the complete pinned stack').toEqual([]);

        const states = built.blocks.states.map(({ runtimeId, values, permutations, tags, javaTags, content }) => ({
            runtimeId,
            values,
            permutations,
            tags,
            javaTags,
            flags: content.flags
        }));
        const digest = createHash('sha256').update(JSON.stringify(states)).digest('hex');

        // Captured from the complete pinned stack. Re-captured when the block families took over
        // the lamp, sponge, concrete powder, cactus and button rules, which changed their flags,
        // and when water and lava stopped taking random ticks, which cleared their flag, and
        // when the catalog moved to 1.26.60, which added three blocks and gave fire, redstone
        // wire and chorus plants their connection states, and when the climbing family took a
        // random tick to grow twisting and weeping vines, which sets its blocks' flag, and when
        // the overlay gave each per-state light level a permutation and every family took
        // `onPlace` for a pillar block's axis, which adds permutations and sets that flag, and
        // when the overlay gave each per-state light dampening a permutation too, and when copper
        // torches and lanterns moved to the torch and lantern families, and when the rails took a
        // scheduled tick for the detector rail, which sets their flag.
        expect(digest).toBe('6ea3d59b2379866f6aa44c762b76279d94367c59b5fdf5c55e8a812f7033a8f0');
    });
});
