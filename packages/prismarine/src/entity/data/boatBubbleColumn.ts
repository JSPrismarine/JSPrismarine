/**
 * How a bubble column moves a boat, after Java 26.3's `AbstractBoat` and `BubbleColumnBlock`.
 *
 * `AbstractBoat.tick` moves the boat and then runs `Entity.applyEffectsFromBlocks` twice, so
 * `BubbleColumnBlock.entityInside` runs twice for each bubble column block in the boat's box.
 * A column whose block above has no collision shape and no fluid calls `onAboveBubbleColumn`,
 * which for a boat only starts a 60-tick count and remembers the column's direction. Any other
 * column calls `Entity.onInsideBubbleColumn`, which pushes the boat up or drags it down a little
 * each time. `AbstractBoat.tickBubbleColumn` then counts down, and when the count runs out it
 * throws the boat up at 0.6 a tick over a rising column, or adds 0.7 down and drops its riders
 * over a sinking one. A tick away from the column's top stops the count.
 *
 * Bedrock's boat file takes the boat out of its rider's control over a column through
 * `minecraft:inside_block_notifier`, which the server keeps, and drags it under with a
 * three-second timer that also takes its seats away, which `javaComponentRules.ts` removes.
 */
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';
import type { EntityPosition } from '@jsprismarine/entities';

import { bodyTouchesBlock } from './collision';
import type { DataEntity } from './DataEntity';

/** The ticks `AbstractBoat.onAboveBubbleColumn` counts before the column acts on the boat. */
export const BUBBLE_TIME = 60;

/** What `AbstractBoat.handleBubbleColumnEffect` adds to a boat's fall over a sinking column. */
export const BUBBLE_DRAG_DOWN = 0.7;

/** The rise `AbstractBoat.handleBubbleColumnEffect` sets on a boat over a rising column. */
export const BUBBLE_THROW_UP = 0.6;

/** `Entity.handleOnInsideBubbleColumn`: a sinking column's pull each time, and the fall it stops at. */
const INSIDE_DRAG_STEP = 0.03;
const INSIDE_DRAG_LIMIT = -0.3;

/** `Entity.handleOnInsideBubbleColumn`: a rising column's push each time, and the rise it stops at. */
const INSIDE_PUSH_STEP = 0.06;
const INSIDE_PUSH_LIMIT = 0.7;

/** `AbstractBoat.tick` runs `applyEffectsFromBlocks` twice a tick. */
const BLOCK_EFFECT_PASSES = 2;

/**
 * A boat's bubble count and the direction of the column it last floated over. Java keeps the
 * count in synched entity data and does not save it.
 */
const bubbleState = defineComponentState(
    'jsprismarine:boat_bubbles',
    { time: stateField.number, down: stateField.boolean },
    { saved: false }
);

/** What a boat's bubble column step reads of the world and does to it. */
export interface BoatBubbleHost {
    /** Whether the block is a bubble column dragging down, rising, or no bubble column. */
    bubbleColumnAt(at: EntityPosition): 'down' | 'up' | undefined;
    /**
     * Whether a block has no collision shape and no fluid, the test `BubbleColumnBlock.entityInside`
     * puts to the block above a column.
     */
    isOpen(at: EntityPosition): boolean;
    /** Drops everything riding the boat. */
    ejectRiders(entity: DataEntity): void;
}

/**
 * Runs one tick of the bubble columns in a boat's box against it, after the tick's move.
 * @returns Whether the count ran out this tick and the column threw or dragged the boat.
 */
export const tickBoatBubbles = (entity: DataEntity, host: BoatBubbleHost): boolean => {
    const { body, instance } = entity;
    let rise = body.velocity.y;
    let above: 'down' | 'up' | undefined;
    for (let pass = 0; pass < BLOCK_EFFECT_PASSES; pass += 1)
        bodyTouchesBlock(body.position, entity.facts.box, (at) => {
            const column = host.bubbleColumnAt(at);
            if (column === undefined) return false;
            if (host.isOpen({ x: at.x, y: at.y + 1, z: at.z })) above = column;
            else
                rise =
                    column === 'down'
                        ? Math.max(INSIDE_DRAG_LIMIT, rise - INSIDE_DRAG_STEP)
                        : Math.min(INSIDE_PUSH_LIMIT, rise + INSIDE_PUSH_STEP);
            // Visit every block of the box.
            return false;
        });

    const state = instance.componentState.get(bubbleState);
    let time = above === undefined ? 0 : state?.time || BUBBLE_TIME;
    const down = above === undefined ? (state?.down ?? false) : above === 'down';
    let acted = false;
    if (time > 0) {
        time -= 1;
        if (time === 0) {
            acted = true;
            if (down) {
                rise -= BUBBLE_DRAG_DOWN;
                host.ejectRiders(entity);
            } else rise = BUBBLE_THROW_UP;
        }
    }
    if (rise !== body.velocity.y) body.velocity = { ...body.velocity, y: rise };
    if (state === undefined ? time !== 0 : state.time !== time || state.down !== down)
        instance.componentState.set(bubbleState, { time, down });
    return acted;
};
