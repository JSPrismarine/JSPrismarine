/**
 * Doors, trapdoors and fence gates: the blocks a player opens.
 *
 * All three share one rule. A hand opens the wooden ones and a redstone
 * signal opens every one of them, iron included, and the state that holds it
 * open is `open_bit` in each case. What differs is the door's second half and
 * the hinge it picks when it is placed.
 */
import type { BlockPlaceEvent, BlockStateValue, HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import type { HorizontalFace } from '../geometry';
import {
    CARDINAL_DIRECTIONS,
    HORIZONTAL_FACES,
    offset,
    opposite,
    rotateClockwise,
    rotateCounterClockwise,
    WEIRDO_DIRECTIONS
} from '../geometry';
import { placedHalf, placementFacing } from '../rules/placement';
import { isSolidSupport, popBlock } from '../rules/support';
import { bareName, hasState, setStates, stateBoolean, stateString } from '../state';
import type { WorldActions } from '../world';
import { dropSelf, isIronOperated, waxOrScrapeOnInteract, weatherOnRandomTick } from './shared';

/** The direction a block with `minecraft:cardinal_direction` faces. */
export const cardinalFacing = (block: HookBlock): HorizontalFace => {
    const value = stateString(block, 'minecraft:cardinal_direction', 'south');
    return CARDINAL_DIRECTIONS.find((face) => face === value) ?? 'south';
};

/** The other half of a door: the upper block from the lower one and back. */
export const otherHalf = (block: HookBlock): HookBlock['position'] =>
    offset(block.position, stateBoolean(block, 'upper_block_bit') ? 'down' : 'up');

/**
 * The hinge a door takes when it is placed.
 *
 * Bedrock puts the hinge on the right unless the block on the left is solid
 * or another door of the same kind already hinges there, which is what makes
 * two doors placed side by side open as a pair.
 */
export const doorHinge = (world: WorldActions, block: HookBlock, facing: HorizontalFace): boolean => {
    const left = rotateCounterClockwise(facing);
    const right = rotateClockwise(facing);

    const leftNeighbor = world.getBlock(offset(block.position, left));
    if (leftNeighbor !== undefined && leftNeighbor.identifier === block.identifier) {
        return !stateBoolean(leftNeighbor, 'door_hinge_bit');
    }

    if (isSolidSupport(world, offset(block.position, left))) return true;
    if (isSolidSupport(world, offset(block.position, right))) return false;
    return false;
};

/** Writes `open_bit` on both halves of a door at once. */
const setDoorOpen = (world: WorldActions, block: HookBlock, open: boolean): void => {
    setStates(world, block, { open_bit: open });
    const other = world.getBlock(otherHalf(block));
    if (other !== undefined && other.identifier === block.identifier) {
        setStates(world, other, { open_bit: open });
    }
    world.playSound(block.position, open ? 'open.door' : 'close.door');
};

/** Doors: two blocks, a hinge, and an iron variant that only redstone opens. */
export const doorFamily = defineFamily(
    'jsprismarine:door',
    'Places the upper half, picks the hinge from its neighbors, toggles both halves on interact unless it is iron, follows redstone, and breaks with its other half.',
    {
        onPlace: (event, world) => {
            if (!hasState(event.block, 'upper_block_bit')) return;
            if (stateBoolean(event.block, 'upper_block_bit')) return;

            // Java's `DoorBlock.getStateForPlacement` keeps the placer's horizontal
            // direction, but Bedrock spells a door's `minecraft:cardinal_direction` a
            // quarter turn clockwise of Java's `facing` (the Geyser-derived table maps Java
            // `north` to Bedrock `east`), so the state rotates while the hinge geometry
            // keeps the real facing. A placement the world performed reads the facing back
            // out of the already-Bedrock state.
            const facing = placementFacing(event) ?? rotateCounterClockwise(cardinalFacing(event.block));
            const hinge = doorHinge(world, event.block, facing);
            const stored = rotateClockwise(facing);

            setStates(world, event.block, {
                'minecraft:cardinal_direction': stored,
                door_hinge_bit: hinge,
                upper_block_bit: false
            });
            world.setBlock(offset(event.block.position, 'up'), event.block.identifier, {
                ...event.block.states,
                'minecraft:cardinal_direction': stored,
                door_hinge_bit: hinge,
                upper_block_bit: true
            });
        },
        onPlayerInteract: (event, world, context) => {
            if (event.sneaking && event.itemStack !== undefined) {
                return waxOrScrapeOnInteract(world, event.block, event.itemStack) ? true : undefined;
            }
            if (isIronOperated(context.identifier)) return undefined;
            setDoorOpen(world, event.block, !stateBoolean(event.block, 'open_bit'));
            return true;
        },
        onRedstoneUpdate: (event, world) => {
            const open = event.power > 0;
            if (open === stateBoolean(event.block, 'open_bit')) return;
            setDoorOpen(world, event.block, open);
        },
        onNeighborChanged: (event, world) => {
            const other = world.getBlock(otherHalf(event.block));
            if (other === undefined || other.identifier !== event.block.identifier) {
                popBlock(world, event.block);
                return;
            }
            if (
                !stateBoolean(event.block, 'upper_block_bit') &&
                !isSolidSupport(world, offset(event.block.position, 'down'))
            ) {
                popBlock(world, event.block);
            }
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onBreak: (event, world) => {
            const other = world.getBlock(otherHalf(event.brokenBlock));
            if (other !== undefined && other.identifier === event.brokenBlock.identifier) {
                world.setBlock(other.position, 'minecraft:air');
            }
            if (!stateBoolean(event.brokenBlock, 'upper_block_bit')) dropSelf(world, event.brokenBlock);
        }
    }
);

/**
 * The Java `facing` a placed trapdoor takes.
 *
 * Java's `TrapDoorBlock.getStateForPlacement` hangs the trapdoor on the side
 * face it was clicked against, and a click on the top or bottom of a block
 * opposes the placer's horizontal direction instead. Java skips the clicked
 * face when the placement replaced the clicked block itself, which the event
 * cannot tell apart, so a click on the side of tall grass keeps the face.
 */
const trapdoorFacing = (event: BlockPlaceEvent): HorizontalFace | undefined => {
    const clicked = HORIZONTAL_FACES.find((face) => face === event.face);
    if (clicked !== undefined) return clicked;
    const facing = placementFacing(event);
    return facing === undefined ? undefined : opposite(facing);
};

/** Trapdoors: one block, opened the same way a door is. */
export const trapdoorFamily = defineFamily(
    'jsprismarine:trapdoor',
    'Hangs on the clicked face or opposite the placer, takes its half from the click, toggles open_bit on interact unless it is iron, follows redstone, and oxidizes when it is copper.',
    {
        onPlace: (event, world) => {
            const patch: Record<string, BlockStateValue> = {};

            // The Geyser-derived table spells the Java facing in the numeric
            // `direction` state on the weirdo order: east 0, west 1, south 2, north 3.
            // `placedHalf` is Java's half rule exactly: the underside of a block and a
            // click in the upper half of a side face take the top.
            const facing = trapdoorFacing(event);
            if (facing !== undefined && hasState(event.block, 'direction')) {
                patch['direction'] = WEIRDO_DIRECTIONS.indexOf(facing);
            }
            const half = placedHalf(event);
            if (half !== undefined && hasState(event.block, 'upside_down_bit')) {
                patch['upside_down_bit'] = half === 'top';
            }
            if (Object.keys(patch).length > 0) setStates(world, event.block, patch);
        },
        onPlayerInteract: (event, world, context) => {
            if (event.sneaking && event.itemStack !== undefined) {
                return waxOrScrapeOnInteract(world, event.block, event.itemStack) ? true : undefined;
            }
            if (isIronOperated(context.identifier)) return undefined;
            const open = !stateBoolean(event.block, 'open_bit');
            setStates(world, event.block, { open_bit: open });
            world.playSound(event.block.position, open ? 'open.trapdoor' : 'close.trapdoor');
            return true;
        },
        onRedstoneUpdate: (event, world) => {
            const open = event.power > 0;
            if (open === stateBoolean(event.block, 'open_bit')) return;
            setStates(world, event.block, { open_bit: open });
            world.playSound(event.block.position, open ? 'open.trapdoor' : 'close.trapdoor');
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** Whether a block is a wall, which is what lowers a fence gate's model. */
const isWallNeighbor = (world: WorldActions, block: HookBlock, face: HorizontalFace): boolean => {
    const neighbor = world.getBlock(offset(block.position, face));
    return neighbor !== undefined && bareName(neighbor.identifier).endsWith('_wall');
};

/** Fence gates, which also drop into a wall beside them. */
export const fenceGateFamily = defineFamily(
    'jsprismarine:fence_gate',
    'Toggles open_bit on interact and on redstone, and sets in_wall_bit when a wall sits on either side.',
    {
        onPlace: (event, world) => {
            if (event.placedBy !== undefined && hasState(event.block, 'minecraft:cardinal_direction')) {
                const facing = placementFacing(event);
                if (facing !== undefined) setStates(world, event.block, { 'minecraft:cardinal_direction': facing });
            }
        },
        onPlayerInteract: (event, world) => {
            const open = !stateBoolean(event.block, 'open_bit');
            setStates(world, event.block, { open_bit: open });
            world.playSound(event.block.position, open ? 'open.fencegate' : 'close.fencegate');
            return true;
        },
        onRedstoneUpdate: (event, world) => {
            const open = event.power > 0;
            if (open === stateBoolean(event.block, 'open_bit')) return;
            setStates(world, event.block, { open_bit: open });
        },
        onNeighborChanged: (event, world) => {
            if (!hasState(event.block, 'in_wall_bit')) return;
            const facing = cardinalFacing(event.block);
            const inWall =
                isWallNeighbor(world, event.block, rotateClockwise(facing)) ||
                isWallNeighbor(world, event.block, rotateCounterClockwise(facing));
            if (inWall !== stateBoolean(event.block, 'in_wall_bit'))
                setStates(world, event.block, { in_wall_bit: inWall });
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);
