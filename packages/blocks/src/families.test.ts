import { describe, expect, it } from 'vitest';

import { behaviorFor, BLOCK_FAMILIES, PORTAL_BLOCK_NAMES } from './families';

describe('PORTAL_BLOCK_NAMES', () => {
    it('is the list the portal family rule matches on', () => {
        const rule = BLOCK_FAMILIES.find((candidate) => candidate.behavior === 'jsprismarine:portal');

        expect(rule?.exact).toEqual(Object.values(PORTAL_BLOCK_NAMES).flat());
    });

    it('sends the portal blocks, the frames and both fires to the portal family', () => {
        for (const name of [
            ...PORTAL_BLOCK_NAMES.netherPortal,
            ...PORTAL_BLOCK_NAMES.endPortal,
            ...PORTAL_BLOCK_NAMES.endPortalFrame,
            ...PORTAL_BLOCK_NAMES.fire
        ]) {
            expect(behaviorFor(`minecraft:${name}`)).toBe('jsprismarine:portal');
        }
    });
});
