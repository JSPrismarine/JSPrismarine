/**
 * A block's drop under a ceiling, as a player mining a wall or a tunnel breaks one.
 *
 * `World.dropFromBlock` starts each stack inside the broken block with 0.2 a tick of upward
 * speed. A stack that rose into the block above used to be taken as landing on it and put on top
 * of it, two blocks up: hidden inside the next block of the wall, and shown only once that block
 * was broken too, beside that block's own drop.
 */
import { describe, expect, it } from 'vitest';

import type { DataEntity } from './DataEntity';
import type { EntityFixture } from './testing';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** The broken block's cell, on top of the fixture's stone floor. */
const BROKEN_Y = FLOOR_Y + 1;

/** How far above where it lies an item reports itself, which the built-in definition declares. */
const OFFSET = 0.125;

/** The height of the built-in definition's collision box. */
const BOX_HEIGHT = 0.25;

/** The upward push `World.dropFromBlock` gives every stack, in blocks a tick. */
const POP = 0.2;

/** Runs ticks the way the world does: each inside an open tick of the change log. */
const step = (fixture: EntityFixture): void => {
    fixture.runtime.store.beginTick();
    fixture.runtime.tick(0);
    fixture.runtime.store.sealTick();
    fixture.world.advance();
};

/** A broken block's cell with stone above it, and a stack reported at `height` within the cell. */
const dropUnderCeiling = (height: number): { fixture: EntityFixture; item: DataEntity } => {
    const fixture = entityFixture(new TestEntityWorld());
    fixture.world.setBlock({ x: 0, y: BROKEN_Y + 1, z: 0 }, 'minecraft:stone');
    const item = fixture.runtime.droppedItems.spawn(
        { x: 0.5, y: BROKEN_Y + height, z: 0.5 },
        { stack: { name: 'minecraft:cobblestone', count: 1 }, motion: { x: 0, y: POP, z: 0 }, reported: true }
    );
    if (item === undefined) throw new Error('the fixture declares no dropped item');
    return { fixture, item };
};

describe('a block drop under a ceiling', () => {
    // The middle 70% of the block, where BDS put every drop it was measured making.
    const heights = [0.15, 0.4, 0.6, 0.7, 0.75, 0.8, 0.85];

    it.each(heights)('stays in the broken block from %f up and comes to rest on its floor', (height) => {
        const { fixture, item } = dropUnderCeiling(height);

        for (let tick = 0; tick < 40; tick += 1) {
            step(fixture);
            // The box never reaches into the block above, where a client draws nothing of it.
            expect(item.position.y - OFFSET + BOX_HEIGHT).toBeLessThanOrEqual(BROKEN_Y + 1);
        }

        expect(item.position.y).toBe(BROKEN_Y + OFFSET);
    });
});
