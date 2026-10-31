import { END_PORTAL, NETHER_PORTAL } from '@jsprismarine/block-behaviors';
import { PORTAL_BLOCK_NAMES } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { PORTAL_TRANSITION_TICKS } from '../../entity/PortalContact';
import { Dimensions } from '../Dimension';
import { DIMENSION_TRAVEL, PORTALS, PORTAL_SEARCH_RADIUS, portalRuleOf, travelRuleOf } from './rules';

describe('DIMENSION_TRAVEL', () => {
    it('searches 128 blocks in the Overworld and the Nether, as Bedrock does, and nowhere in the End', () => {
        // Java: `sipush 128` for the Nether and `bipush 16` for the Overworld; Bedrock uses 128 both ways.
        expect(PORTAL_SEARCH_RADIUS).toBe(128);
        expect(DIMENSION_TRAVEL['minecraft:overworld']?.portalSearchRadius).toBe(128);
        expect(DIMENSION_TRAVEL['minecraft:the_nether']?.portalSearchRadius).toBe(128);
        expect(DIMENSION_TRAVEL['minecraft:the_end']?.portalSearchRadius).toBe(0);
    });

    it("allows a nether portal where Java's inPortalDimension does, and not in the End", () => {
        expect(travelRuleOf(Dimensions.Overworld)?.allowsNetherPortal).toBe(true);
        expect(travelRuleOf(Dimensions.Nether)?.allowsNetherPortal).toBe(true);
        expect(travelRuleOf(Dimensions.TheEnd)?.allowsNetherPortal).toBe(false);
    });

    it('names the bed for the Overworld and the respawn anchor for the Nether', () => {
        expect(travelRuleOf(Dimensions.Overworld)?.respawnBlock).toBe('bed');
        expect(travelRuleOf(Dimensions.Nether)?.respawnBlock).toBe('respawn_anchor');
        expect(travelRuleOf(Dimensions.TheEnd)?.respawnBlock).toBeUndefined();
    });

    it('is keyed by the Java dimension type id', () => {
        expect(Object.keys(DIMENSION_TRAVEL).sort()).toEqual(
            [Dimensions.Overworld.id, Dimensions.Nether.id, Dimensions.TheEnd.id].sort()
        );
    });
});

describe('PORTALS', () => {
    it('derives the portal and frame lists from the shared block names', () => {
        expect(PORTALS[NETHER_PORTAL]?.portal).toEqual(
            PORTAL_BLOCK_NAMES.netherPortal.map((name) => `minecraft:${name}`)
        );
        expect(PORTALS[NETHER_PORTAL]?.frame).toEqual(['minecraft:obsidian']);
        expect(PORTALS[END_PORTAL]?.frame).toEqual(
            PORTAL_BLOCK_NAMES.endPortalFrame.map((name) => `minecraft:${name}`)
        );
    });

    it('links the Overworld and the Nether both ways, and a nether portal in the End to the Overworld', () => {
        const links = PORTALS[NETHER_PORTAL]!.links;
        expect(links['minecraft:overworld']).toBe('minecraft:the_nether');
        expect(links['minecraft:the_nether']).toBe('minecraft:overworld');
        expect(links['minecraft:the_end']).toBe('minecraft:overworld');
    });

    it('links an end portal into the End from the other two and out to the Overworld', () => {
        const links = PORTALS[END_PORTAL]!.links;
        expect(links['minecraft:overworld']).toBe('minecraft:the_end');
        expect(links['minecraft:the_nether']).toBe('minecraft:the_end');
        expect(links['minecraft:the_end']).toBe('minecraft:overworld');
    });

    it("waits Java's 80 ticks in survival and 0 in creative at a nether portal, and never at an end portal", () => {
        // `players_nether_portal_default_delay` is 80 and `players_nether_portal_creative_delay` is 0.
        expect(PORTALS[NETHER_PORTAL]?.delayTicks).toEqual({ survival: 80, creative: 0 });
        expect(PORTALS[NETHER_PORTAL]?.delayTicks.survival).toBe(PORTAL_TRANSITION_TICKS.player);
        // `EndPortalBlock` inherits `Portal.getPortalTransitionTime`, which is 0.
        expect(PORTALS[END_PORTAL]?.delayTicks).toEqual({ survival: 0, creative: 0 });
    });

    it('finds a rule by any spelling of the portal block, and none for another block', () => {
        expect(portalRuleOf('minecraft:portal')?.kind).toBe('nether');
        expect(portalRuleOf('minecraft:end_portal')?.kind).toBe('end');
        expect(portalRuleOf('minecraft:obsidian')).toBeUndefined();
        expect(portalRuleOf('minecraft:end_gateway')).toBeUndefined();
    });
});
