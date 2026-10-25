/**
 * How a name a player typed is matched against the structure identifiers a generator knows.
 *
 * Worth its own tests because the two sides spell structures differently: Bedrock's `/locate
 * structure` names a family, Java's registry has one identifier per variant, and a comparison
 * that is too loose finds the wrong thing while one that is too strict finds nothing.
 */
import { describe, expect, it } from 'vitest';

import { structureNameMatches } from './World';

describe('structureNameMatches', () => {
    it('matches the full identifier', () => {
        expect(structureNameMatches('minecraft:village_plains', 'minecraft:village_plains')).toBe(true);
    });

    it('matches the path on its own, which is what a player normally types', () => {
        expect(structureNameMatches('village_plains', 'minecraft:village_plains')).toBe(true);
    });

    it('matches a family name against every variant of it', () => {
        for (const variant of ['plains', 'desert', 'savanna', 'snowy', 'taiga']) {
            expect(structureNameMatches('village', `minecraft:village_${variant}`)).toBe(true);
        }
    });

    it("reads Bedrock's unseparated spelling as Java's separated one", () => {
        expect(structureNameMatches('ruinedportal', 'minecraft:ruined_portal')).toBe(true);
        expect(structureNameMatches('pillageroutpost', 'minecraft:pillager_outpost')).toBe(true);
    });

    it('ignores case on either side', () => {
        expect(structureNameMatches('Village', 'minecraft:VILLAGE_PLAINS')).toBe(true);
    });

    it('takes a tag reference as the name inside it', () => {
        expect(structureNameMatches('#village', 'minecraft:village_plains')).toBe(true);
    });

    it('stops a family name at a variant boundary rather than anywhere in the path', () => {
        // `ruin` is a prefix of `ruined_portal`'s first part, not a part of its own.
        expect(structureNameMatches('ruin', 'minecraft:ruined_portal')).toBe(false);
        expect(structureNameMatches('vil', 'minecraft:village_plains')).toBe(false);
    });

    it('does not match an unrelated structure', () => {
        expect(structureNameMatches('village', 'minecraft:ocean_monument')).toBe(false);
        expect(structureNameMatches('fortress', 'minecraft:village_plains')).toBe(false);
    });

    it('does not let a later part of a path stand in for the whole name', () => {
        // Otherwise `/locate structure portal` would answer with a ruined portal, and
        // `/locate structure monument` with an ocean one.
        expect(structureNameMatches('portal', 'minecraft:ruined_portal')).toBe(false);
        expect(structureNameMatches('monument', 'minecraft:ocean_monument')).toBe(false);
    });
});
