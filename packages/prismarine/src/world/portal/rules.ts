/**
 * The travel rules as data: what each dimension allows, and where each portal block leads.
 *
 * Java spreads these over `PortalForcer`, `NetherPortalBlock`, `EndPortalBlock` and
 * `BaseFireBlock`; Bedrock changes three of the numbers. Both are recorded here with their
 * source, so `DimensionTravel` reads a table and branches on nothing. The block lists come
 * from `@jsprismarine/block-behaviors`, which derives them from the shared
 * `PORTAL_BLOCK_NAMES` in `@jsprismarine/blocks`, so the family that lights a portal and the
 * service that travels through one agree on what a portal is.
 */
import {
    END_PORTAL,
    END_PORTAL_FRAME_BLOCKS,
    NETHER_PORTAL,
    NETHER_PORTAL_BLOCKS,
    NETHER_PORTAL_FRAME_BLOCKS
} from '@jsprismarine/block-behaviors';

import { PORTAL_TRANSITION_TICKS } from '../../entity/PortalContact';
import { Dimensions } from '../Dimension';
import type { DimensionType } from '../Dimension';

/**
 * How far from the scaled target an existing portal is looked for, in blocks.
 *
 * Java's `PortalForcer.findClosestPortalPosition` uses `sipush 128` in the Nether and
 * `bipush 16` in the Overworld. Bedrock searches a 128 block radius in both (wiki, "the point
 * of interest can be within a 256x256 square block area (128-block radius) in both the
 * Overworld and Nether"), and that is the number this server uses.
 */
export const PORTAL_SEARCH_RADIUS = 128;

/** What one dimension type allows a traveler to do. */
export interface DimensionTravelRule {
    /** Radius of the search for an existing portal around the scaled target, in blocks. */
    readonly portalSearchRadius: number;
    /**
     * Whether a nether portal can exist here: Java's `BaseFireBlock.inPortalDimension`, which
     * is true for the Overworld and the Nether only. Nothing creates a portal where this is
     * false.
     */
    readonly allowsNetherPortal: boolean;
}

/**
 * The travel rule of each vanilla dimension type, keyed by Java `dimension_type` id.
 *
 * The coordinate scale is not here: it is `DimensionType.java.coordinateScale`, read from
 * the dimension's own document. Nor is which block holds a spawn: `RespawnPoint.ts` reads
 * Java's `bed_works` and `respawn_anchor_works` attributes off the same document.
 */
export const DIMENSION_TRAVEL: Readonly<Record<string, DimensionTravelRule>> = {
    [Dimensions.Overworld.id]: {
        portalSearchRadius: PORTAL_SEARCH_RADIUS,
        allowsNetherPortal: true
    },
    [Dimensions.Nether.id]: {
        portalSearchRadius: PORTAL_SEARCH_RADIUS,
        allowsNetherPortal: true
    },
    [Dimensions.TheEnd.id]: {
        // No nether portal is searched for in the End: none can be lit there.
        portalSearchRadius: 0,
        allowsNetherPortal: false
    }
};

/** The travel rule of a dimension, or undefined for a type the table does not know. */
export const travelRuleOf = (dimension: DimensionType): DimensionTravelRule | undefined =>
    DIMENSION_TRAVEL[dimension.id];

/** What a portal block does to whoever stands in it. */
export interface PortalRule {
    /** A nether portal links two dimensions by scaled position; an end portal has fixed ends. */
    readonly kind: 'nether' | 'end';
    /** The blocks the portal's frame is made of. */
    readonly frame: readonly string[];
    /** Every block identifier that reads as this portal. */
    readonly portal: readonly string[];
    /** The Java dimension type id a trip from each dimension type arrives in. */
    readonly links: Readonly<Record<string, string>>;
    /**
     * Ticks a player stands in the portal before the trip, by game mode. Java's
     * `players_nether_portal_default_delay` (80) and `players_nether_portal_creative_delay`
     * (0) game rules; `EndPortalBlock` keeps `Portal.getPortalTransitionTime`'s default of 0.
     * Everything that is not a player goes through on the first tick either way.
     */
    readonly delayTicks: { readonly survival: number; readonly creative: number };
}

/**
 * The rule of each portal block, keyed by the Bedrock identifier of its first spelling.
 *
 * The links are Java's `NetherPortalBlock.getPortalDestination` (Overworld and Nether swap)
 * and `EndPortalBlock.getPortalDestination` (into the End from anywhere else, out of it to the
 * Overworld). A nether portal in the End cannot be lit, but one a command placed leads to the
 * Overworld, which is the Bedrock behavior and the only sensible one.
 */
export const PORTALS: Readonly<Record<string, PortalRule>> = {
    [NETHER_PORTAL]: {
        kind: 'nether',
        frame: NETHER_PORTAL_FRAME_BLOCKS,
        portal: NETHER_PORTAL_BLOCKS,
        links: {
            [Dimensions.Overworld.id]: Dimensions.Nether.id,
            [Dimensions.Nether.id]: Dimensions.Overworld.id,
            [Dimensions.TheEnd.id]: Dimensions.Overworld.id
        },
        delayTicks: { survival: PORTAL_TRANSITION_TICKS.player, creative: PORTAL_TRANSITION_TICKS.creative }
    },
    [END_PORTAL]: {
        kind: 'end',
        frame: END_PORTAL_FRAME_BLOCKS,
        portal: [END_PORTAL],
        links: {
            [Dimensions.Overworld.id]: Dimensions.TheEnd.id,
            [Dimensions.Nether.id]: Dimensions.TheEnd.id,
            [Dimensions.TheEnd.id]: Dimensions.Overworld.id
        },
        // Java's `EndPortalBlock` inherits `Portal.getPortalTransitionTime`, which is 0.
        delayTicks: { survival: 0, creative: 0 }
    }
};

/** The rule of a portal block by any of its identifiers, or undefined for a block that is no portal. */
export const portalRuleOf = (block: string): PortalRule | undefined =>
    PORTALS[block] ?? Object.values(PORTALS).find((rule) => rule.portal.includes(block));

/** Every identifier {@link PORTALS} names, for the per-tick check of what an entity stands in. */
const PORTAL_BLOCKS: ReadonlySet<string> = new Set(Object.values(PORTALS).flatMap((rule) => rule.portal));

/** Whether a block identifier is one of the portal blocks in {@link PORTALS}. */
export const isPortalBlock = (block: string): boolean => PORTAL_BLOCKS.has(block);
