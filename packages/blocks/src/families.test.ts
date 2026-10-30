import { describe, expect, it } from 'vitest';

import { behaviorFor, BLOCK_FAMILIES, PORTAL_BLOCK_NAMES } from './families';

describe('PORTAL_BLOCK_NAMES', () => {
    it('is the list the portal family rule matches on', () => {
        const rule = BLOCK_FAMILIES.find((candidate) => candidate.behavior === 'jsprismarine:portal');

        expect(rule?.exact).toEqual(Object.values(PORTAL_BLOCK_NAMES).flat());
    });

    it('sends the portal blocks, the gateway, the frames and both fires to the portal family', () => {
        for (const name of Object.values(PORTAL_BLOCK_NAMES).flat()) {
            expect(behaviorFor(`minecraft:${name}`)).toBe('jsprismarine:portal');
        }
    });

    it('names only Bedrock palette blocks, so no earlier rule can shadow one', () => {
        const earlierRules = BLOCK_FAMILIES.slice(
            0,
            BLOCK_FAMILIES.findIndex((candidate) => candidate.behavior === 'jsprismarine:portal')
        );
        const claimedEarlier = new Set(earlierRules.flatMap((rule) => rule.exact ?? []));

        expect(PORTAL_BLOCK_NAMES.netherPortal).toEqual(['portal']);
        for (const name of Object.values(PORTAL_BLOCK_NAMES).flat()) {
            expect(claimedEarlier.has(name), name).toBe(false);
        }
    });
});
