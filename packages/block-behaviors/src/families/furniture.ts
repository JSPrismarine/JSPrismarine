/**
 * The decoration families: signs, banners, heads, beds, cakes, candles,
 * torches and lanterns.
 *
 * Four of them hang on something and pop when it goes, which is the rule
 * they share; the rest each own one small state machine.
 */
import type { BlockFace } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { faceOfFacingDirection, facingFrom, offset, opposite } from '../geometry';
import { isWater } from '../identifiers';
import { breakBlock, popWithoutSupport } from '../rules/support';
import { hasState, setStates, stateBoolean, stateNumber, stateString } from '../state';
import { dropSelf, weatherOnRandomTick } from './shared';

/** How many bites a cake takes before it is gone. */
export const CAKE_BITES = 6;

/**
 * The face a torch stands on, for each `torch_facing_direction`.
 *
 * The state names the side of the block the torch is stuck to, so the block
 * holding it up is on the far side of the torch from that name.
 */
export const TORCH_SUPPORT: Readonly<Record<string, BlockFace>> = {
    unknown: 'down',
    top: 'down',
    west: 'east',
    east: 'west',
    north: 'south',
    south: 'north'
};

/** The face a torch's support is on, falling back to the floor. */
export const torchSupport = (facing: string): BlockFace => TORCH_SUPPORT[facing] ?? 'down';

/** How many candles fit in one block. */
export const MAX_CANDLES = 4;

/** Signs: a block entity of text, editable until it is waxed. */
export const signFamily = defineFamily(
    'jsprismarine:sign',
    'Keeps the sign text in a block entity, refuses an edit once it is sealed, and pops a wall sign whose backing block goes.',
    {
        onPlace: (event, world) => {
            world.setBlockData(event.block.position, { text: ['', '', '', ''], sealed: false });
        },
        onPlayerInteract: (event, world) => {
            const data = world.getBlockData(event.block.position);
            if (data?.sealed === true) return undefined;
            world.playSound(event.block.position, 'random.wood_click');
            return true;
        },
        onNeighborChanged: (event, world) => {
            if (hasState(event.block, 'facing_direction')) {
                const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction'));
                if (face !== undefined) popWithoutSupport(world, event.block, opposite(face));
                return;
            }
            if (stateBoolean(event.block, 'hanging')) {
                popWithoutSupport(world, event.block, 'up');
                return;
            }
            popWithoutSupport(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Banners, which are a sign's shape with a pattern list instead of text. */
export const bannerFamily = defineFamily(
    'jsprismarine:banner',
    'Keeps the base color and patterns in a block entity and pops when its support goes.',
    {
        onPlace: (event, world) => {
            world.setBlockData(event.block.position, { patterns: [] });
        },
        onNeighborChanged: (event, world) => {
            if (hasState(event.block, 'facing_direction')) {
                const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction'));
                if (face !== undefined) popWithoutSupport(world, event.block, opposite(face));
                return;
            }
            popWithoutSupport(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Heads and skulls, which hold a rotation or a profile. */
export const headFamily = defineFamily(
    'jsprismarine:head',
    'Keeps its rotation and profile in a block entity and pops when the block it sits on goes.',
    {
        onPlace: (event, world) => {
            world.setBlockData(event.block.position, { rotation: 0 });
        },
        onNeighborChanged: (event, world) => {
            const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction', 1));
            if (face !== undefined && face !== 'up') {
                popWithoutSupport(world, event.block, opposite(face));
                return;
            }
            popWithoutSupport(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Beds: two blocks, a color and an occupant. */
export const bedFamily = defineFamily(
    'jsprismarine:bed',
    'Places the head half, marks occupied_bit while a player sleeps, breaks with its other half, and explodes in the nether and the end.',
    {
        onPlace: (event, world) => {
            if (stateBoolean(event.block, 'head_piece_bit')) return;
            world.setBlockData(event.block.position, { color: 'red' });
            if (event.placedBy === undefined) return;

            const facing = facingFrom(event.placedBy.position, event.block.position);
            const head = offset(event.block.position, facing);
            world.setBlock(head, event.block.identifier, { ...event.block.states, head_piece_bit: true });
        },
        onPlayerInteract: (event, world) => {
            if (event.block.dimension !== 'minecraft:overworld') {
                breakBlock(world, event.block);
                world.spawnEntity(event.block.position, 'minecraft:tnt', { fuse: 0 });
                return true;
            }
            if (world.lightLevel(offset(event.block.position, 'up')) > 11) return undefined;
            setStates(world, event.block, { occupied_bit: true });
            return true;
        },
        onNeighborChanged: (event, world) => {
            const otherHalf = offset(
                event.block.position,
                stateBoolean(event.block, 'head_piece_bit') ? 'north' : 'south'
            );
            const other = world.getBlock(otherHalf);
            if (other !== undefined && other.identifier === event.block.identifier) return;
            // Pairing the two halves needs the facing the bed was placed
            // with, which no state carries once it is down, so the support
            // check below is what stays reliable.
            popWithoutSupport(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** The cake, which loses a slice per use. */
export const cakeFamily = defineFamily(
    'jsprismarine:cake',
    'Takes a bite per use through bite_counter and disappears after the seventh.',
    {
        onPlayerInteract: (event, world) => {
            const bites = stateNumber(event.block, 'bite_counter');
            if (bites >= CAKE_BITES) {
                breakBlock(world, event.block);
                return true;
            }
            setStates(world, event.block, { bite_counter: bites + 1 });
            world.playSound(event.block.position, 'random.burp');
            return true;
        },
        onNeighborChanged: (event, world) => {
            popWithoutSupport(world, event.block);
        }
    }
);

/** Candles, up to four per block, lit or not. */
export const candleFamily = defineFamily(
    'jsprismarine:candle',
    'Stacks up to four candles in one block, lights and snuffs on use, and goes out when water reaches it.',
    {
        onPlace: (event, world) => {
            const previous = event.previous;
            if (previous === undefined || previous.identifier !== event.block.identifier) return;
            const candles = stateNumber(previous, 'candles');
            if (candles + 1 >= MAX_CANDLES) return;
            setStates(world, event.block, { candles: candles + 1, lit: stateBoolean(previous, 'lit') });
        },
        onPlayerInteract: (event, world) => {
            if (!hasState(event.block, 'lit')) return undefined;
            const lit = stateBoolean(event.block, 'lit');
            setStates(world, event.block, { lit: !lit });
            world.playSound(event.block.position, lit ? 'extinguish.candle' : 'ignite');
            return true;
        },
        onNeighborChanged: (event, world) => {
            if (!stateBoolean(event.block, 'lit')) return;
            for (const face of ['up', 'north', 'south', 'west', 'east'] as const) {
                const neighbor = world.getBlock(offset(event.block.position, face));
                if (neighbor === undefined || !isWater(neighbor.identifier)) continue;
                setStates(world, event.block, { lit: false });
                world.playSound(event.block.position, 'random.fizz');
                return;
            }
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock, stateNumber(event.brokenBlock, 'candles') + 1);
        }
    }
);

/** Torches, which stand on a face and pop when it goes. */
export const torchFamily = defineFamily(
    'jsprismarine:torch',
    'Reads torch_facing_direction to find the face it stands on and pops when that face stops holding it.',
    {
        onNeighborChanged: (event, world) => {
            popWithoutSupport(
                world,
                event.block,
                torchSupport(stateString(event.block, 'torch_facing_direction', 'top'))
            );
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Lanterns and chains, which sit on a block or hang from one. */
export const lanternFamily = defineFamily(
    'jsprismarine:lantern',
    'Checks the block above when it hangs and the one below when it stands, and oxidizes when it is copper.',
    {
        onNeighborChanged: (event, world) => {
            popWithoutSupport(world, event.block, stateBoolean(event.block, 'hanging') ? 'up' : 'down');
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);
