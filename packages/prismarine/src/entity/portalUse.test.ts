import { describe, expect, it } from 'vitest';

import { canUsePortal } from './portalUse';

describe('canUsePortal', () => {
    it("keeps Java's ender dragon and fishing hook out of portals", () => {
        expect(canUsePortal('minecraft:ender_dragon', () => true)).toBe(false);
        expect(canUsePortal('minecraft:fishing_hook', () => false)).toBe(false);
    });

    it("lets arrows and fireballs through, which Bedrock's dimension_bound would hold back", () => {
        expect(canUsePortal('minecraft:arrow', () => true)).toBe(true);
        expect(canUsePortal('minecraft:fireball', () => true)).toBe(true);
    });

    it('holds a creaking back only while its heart binds it', () => {
        expect(canUsePortal('minecraft:creaking', (component) => component === 'minecraft:dimension_bound')).toBe(
            false
        );
        expect(canUsePortal('minecraft:creaking', () => false)).toBe(true);
    });
});
