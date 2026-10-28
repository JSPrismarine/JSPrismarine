/**
 * The random tick driver.
 *
 * `ServerLevel.tickChunk` draws `random_tick_speed` positions from every
 * randomly ticking 16 by 16 by 16 section of a chunk and calls `randomTick` on
 * each block it lands on. Positions are drawn with replacement, so
 * one block can be picked twice in a chunk tick, which Java's own documentation
 * calls out.
 *
 * The draw uses `Level.getBlockRandomPos`, a linear congruential step with the
 * multiplier 3 and the increment 1013904223. It is transcribed exactly, because
 * it is the only part of the generator that is reachable from outside and the
 * distribution of crop growth depends on it.
 *
 * Java's `random_tick_speed` defaults to 3 and means three draws per section.
 * Bedrock's `randomtickspeed` defaults to 1 and the wiki says it "specifies
 * only relative speed instead of the exact number", with no published mapping,
 * so this package implements Java's absolute three and says so.
 */

import { isRandomlyTicking } from './blockRules';
import type { BlockPosition, WorldAccess } from './world';

/** Java's `random_tick_speed` default, read from the game rule registry. */
export const DEFAULT_RANDOM_TICK_SPEED = 3;

/** The edge length of a chunk section, which bounds every draw. */
export const SECTION_SIZE = 16;

/**
 * Java's `Level.getBlockRandomPos`, which is also the world's own tick-order
 * randomizer: one state, stepped once per draw.
 *
 * Java holds the state on the level and steps it with `randValue * 3 + 1013904223`,
 * then uses bits 2 to 5 for x, bits 10 to 13 for z and bits 18 to 21 for y.
 */
export class BlockRandomPositions {
    private state: number;

    /**
     * @param seed - The starting value, which Java leaves at 0 for a new level.
     */
    constructor(seed = 0) {
        this.state = seed | 0;
    }

    /**
     * The next position inside one section.
     *
     * @param originX - The section's lowest x.
     * @param originY - The section's lowest y.
     * @param originZ - The section's lowest z.
     * @param yMask - The y mask, which `tickChunk` passes as 15.
     */
    next(originX: number, originY: number, originZ: number, yMask = 15): BlockPosition {
        this.state = (Math.imul(this.state, 3) + 1013904223) | 0;
        const value = this.state >> 2;
        return {
            x: originX + (value & 15),
            y: originY + ((value >> 16) & yMask),
            z: originZ + ((value >> 8) & 15)
        };
    }
}

/** One section to draw positions from. */
export interface SectionOrigin {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * Draw the positions one chunk tick visits in one section.
 *
 * @param positions - The draw source, shared across the whole world in Java.
 * @param section - The section's lowest corner.
 * @param tickSpeed - `random_tick_speed`, Java's 3 by default.
 * @returns `tickSpeed` positions, which may repeat.
 */
export const drawSectionPositions = (
    positions: BlockRandomPositions,
    section: SectionOrigin,
    tickSpeed: number = DEFAULT_RANDOM_TICK_SPEED
): BlockPosition[] => {
    const drawn: BlockPosition[] = [];
    for (let i = 0; i < tickSpeed; i++) drawn.push(positions.next(section.x, section.y, section.z));
    return drawn;
};

/**
 * Run one chunk tick's random ticks over a list of sections.
 *
 * Positions whose block does not take random ticks are drawn and discarded,
 * which is what Java does: the draw happens first and the filter second, so a
 * section full of stone still consumes its draws.
 *
 * @param world - The world to read.
 * @param positions - The draw source.
 * @param sections - The randomly ticking sections of one chunk.
 * @param run - Called for each drawn position whose block takes random ticks.
 * @param tickSpeed - `random_tick_speed`, Java's 3 by default.
 * @returns How many positions reached `run`.
 */
export const runRandomTicks = (
    world: WorldAccess,
    positions: BlockRandomPositions,
    sections: readonly SectionOrigin[],
    run: (at: BlockPosition) => void,
    tickSpeed: number = DEFAULT_RANDOM_TICK_SPEED
): number => {
    if (tickSpeed <= 0) return 0;
    let ticked = 0;
    for (const section of sections) {
        for (const at of drawSectionPositions(positions, section, tickSpeed)) {
            if (!isRandomlyTicking(world.getBlock(at))) continue;
            ticked++;
            run(at);
        }
    }
    return ticked;
};
