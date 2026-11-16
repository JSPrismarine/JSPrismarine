import { describe, expect, it } from 'vitest';

import { normalizedItemIdentifier } from './shared';

describe('normalizedItemIdentifier', () => {
    it('adds the default namespace', () => {
        expect(normalizedItemIdentifier('bone')).toBe('minecraft:bone');
        expect(normalizedItemIdentifier('test:thing')).toBe('test:thing');
    });

    it('reads a legacy pack name as the modern item a held stack arrives as', () => {
        // The cat and ocelot tame and trust with `fish`, which a player holds as cod.
        expect(normalizedItemIdentifier('fish')).toBe('minecraft:cod');
        expect(normalizedItemIdentifier('minecraft:appleEnchanted')).toBe('minecraft:enchanted_golden_apple');
        expect(normalizedItemIdentifier('muttonRaw')).toBe('minecraft:mutton');
    });
});
