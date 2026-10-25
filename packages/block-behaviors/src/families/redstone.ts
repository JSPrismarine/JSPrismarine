/**
 * The redstone families: the components themselves, buttons, pressure plates
 * and rails.
 *
 * `jsprismarine:redstone` covers 31 blocks that share no single rule, so the
 * family branches on the bare name once per hook. Each branch is small; what
 * they have in common is the power model in `rules/redstone.ts`.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { faceOfFacingDirection, offset, opposite } from '../geometry';
import { AIR } from '../identifiers';
import { containerSignal } from '../rules/container';
import { isIgniter } from '../rules/heldItem';
import { performPull, performPush } from '../rules/piston';
import {
    BUTTON_PRESS_TICKS,
    MAX_POWER,
    OBSERVER_PULSE_TICKS,
    PRESSURE_PLATE_RELEASE_TICKS,
    REDSTONE_TICK,
    weightedPlateSignal,
    wireSignal
} from '../rules/redstone';
import { isSolidSupport, popWithoutSupport } from '../rules/support';
import { bareName, hasState, setStates, sibling, stateBoolean, stateNumber } from '../state';
import type { WorldActions } from '../world';
import { cardinalFacing } from './openable';
import { dropSelf } from './shared';

/** How long primed TNT burns before it goes off, in ticks. */
export const TNT_FUSE_TICKS = 80;

/** The two blocks a redstone lamp switches between. */
const LAMP_PAIR = { off: 'redstone_lamp', on: 'lit_redstone_lamp' } as const;

/** The two blocks a redstone torch switches between. */
const TORCH_PAIR = { off: 'unlit_redstone_torch', on: 'redstone_torch' } as const;

/** The two blocks a repeater switches between. */
const REPEATER_PAIR = { off: 'unpowered_repeater', on: 'powered_repeater' } as const;

/** The two blocks a comparator switches between. */
const COMPARATOR_PAIR = { off: 'unpowered_comparator', on: 'powered_comparator' } as const;

const swapPair = (
    world: WorldActions,
    block: HookBlock,
    pair: { readonly off: string; readonly on: string },
    on: boolean
): void => {
    const target = sibling(block.identifier, on ? pair.on : pair.off);
    if (target === block.identifier) return;
    world.setBlock(block.position, target, block.states);
    world.notifyNeighbors(block.position);
};

/** The face a piston points along, from its numeric `facing_direction`. */
const pistonFacing = (block: HookBlock): ReturnType<typeof faceOfFacingDirection> =>
    faceOfFacingDirection(stateNumber(block, 'facing_direction'));

/** How many entities stand on a weighted plate per step of its signal. */
const PLATE_WEIGHTS: Readonly<Record<string, number>> = {
    light_weighted_pressure_plate: 1,
    heavy_weighted_pressure_plate: 10
};

/**
 * The comparator signal of whatever sits behind a comparator.
 *
 * A container answers with its fill level. A block with a counter state
 * answers with the counter, which covers the cake, the cauldron, the
 * composter, the beehive and the respawn anchor without naming each one.
 */
export const comparatorInput = (world: WorldActions, block: HookBlock): number => {
    const behind = offset(block.position, opposite(cardinalFacing(block)));
    const data = world.getBlockData(behind);
    if (data?.items !== undefined) return containerSignal(data);

    const source = world.getBlock(behind);
    if (source === undefined) return 0;
    for (const state of [
        'composter_fill_level',
        'honey_level',
        'bite_counter',
        'fill_level',
        'respawn_anchor_charge'
    ]) {
        if (hasState(source, state)) return Math.min(MAX_POWER, stateNumber(source, state));
    }
    return 0;
};

const onRedstone = (event: { block: HookBlock; power: number }, world: WorldActions): void => {
    const block = event.block;
    const powered = event.power > 0;

    switch (bareName(block.identifier)) {
        case 'piston':
        case 'sticky_piston': {
            const facing = pistonFacing(block);
            if (facing === undefined) return;
            const sticky = bareName(block.identifier) === 'sticky_piston';
            const head = sibling(block.identifier, sticky ? 'sticky_piston_arm_collision' : 'piston_arm_collision');
            if (powered) {
                if (!performPush(world, block.position, facing)) return;
                world.setBlock(offset(block.position, facing), head, {
                    facing_direction: stateNumber(block, 'facing_direction')
                });
                world.playSound(block.position, 'tile.piston.out');
                return;
            }
            const front = world.getBlock(offset(block.position, facing));
            if (front !== undefined && bareName(front.identifier).endsWith('piston_arm_collision')) {
                world.setBlock(front.position, 'minecraft:air');
            }
            if (sticky) performPull(world, block.position, facing);
            world.playSound(block.position, 'tile.piston.in');
            return;
        }
        case 'redstone_lamp':
        case 'lit_redstone_lamp':
            swapPair(world, block, LAMP_PAIR, powered);
            return;
        case 'redstone_torch':
        case 'unlit_redstone_torch':
            // A torch inverts its attachment, and takes a redstone tick to do it.
            world.scheduleTick(block.position, REDSTONE_TICK);
            return;
        case 'powered_repeater':
        case 'unpowered_repeater':
            world.scheduleTick(block.position, (stateNumber(block, 'repeater_delay') + 1) * REDSTONE_TICK);
            return;
        case 'powered_comparator':
        case 'unpowered_comparator':
            world.scheduleTick(block.position, REDSTONE_TICK);
            return;
        case 'dispenser':
        case 'dropper':
        case 'crafter': {
            const triggered = stateBoolean(block, 'triggered_bit');
            if (powered === triggered) return;
            setStates(world, block, { triggered_bit: powered });
            if (powered) world.playSound(block.position, 'random.click');
            return;
        }
        case 'hopper':
            if (stateBoolean(block, 'toggle_bit') !== powered) setStates(world, block, { toggle_bit: powered });
            return;
        case 'noteblock':
            if (powered) world.playSound(block.position, 'note.harp');
            return;
        case 'tnt':
            if (!powered) return;
            world.setBlock(block.position, 'minecraft:air');
            world.spawnEntity(block.position, 'minecraft:tnt', { fuse: TNT_FUSE_TICKS });
            return;
        case 'bell':
            if (powered) world.playSound(block.position, 'block.bell.hit');
            return;
        case 'lightning_rod':
            if (stateBoolean(block, 'powered_bit') !== powered) setStates(world, block, { powered_bit: powered });
            return;
        default:
            return;
    }
};

/** The redstone components: wire, the two delays, the observer, both pistons and the rest. */
export const redstoneFamily = defineFamily(
    'jsprismarine:redstone',
    'Branches by name over the 31 redstone blocks: wire fading, repeater and comparator delays, the observer pulse, piston push and pull, the lit and unlit block pairs, and the triggered containers.',
    {
        onRedstoneUpdate: (event, world) => {
            onRedstone(event, world);
        },
        onNeighborChanged: (event, world) => {
            const block = event.block;
            const name = bareName(block.identifier);

            if (name === 'redstone_wire') {
                const signal = wireSignal(world, block);
                if (signal !== stateNumber(block, 'redstone_signal')) {
                    setStates(world, block, { redstone_signal: signal });
                    world.notifyNeighbors(block.position);
                }
                return;
            }

            if (name === 'observer') {
                const facing = block.states['minecraft:facing_direction'];
                if (typeof facing === 'string' && facing === event.face && !stateBoolean(block, 'powered_bit')) {
                    setStates(world, block, { powered_bit: true });
                    world.scheduleTick(block.position, OBSERVER_PULSE_TICKS);
                }
                return;
            }

            if (name === 'lever' || name.endsWith('_torch')) popWithoutSupport(world, block);
        },
        onTick: (event, world) => {
            const block = event.block;
            switch (bareName(block.identifier)) {
                case 'observer':
                    if (stateBoolean(block, 'powered_bit')) {
                        setStates(world, block, { powered_bit: false });
                        world.notifyNeighbors(block.position);
                    }
                    return;
                case 'powered_repeater':
                case 'unpowered_repeater':
                    swapPair(world, block, REPEATER_PAIR, world.redstonePower(block.position) > 0);
                    return;
                case 'powered_comparator':
                case 'unpowered_comparator': {
                    const signal = comparatorInput(world, block);
                    world.setBlockData(block.position, { signal });
                    swapPair(world, block, COMPARATOR_PAIR, signal > 0);
                    if (stateBoolean(block, 'output_lit_bit') !== signal > 0) {
                        const current = world.getBlock(block.position) ?? block;
                        setStates(world, current, { output_lit_bit: signal > 0 });
                    }
                    return;
                }
                case 'redstone_torch':
                case 'unlit_redstone_torch':
                    swapPair(world, block, TORCH_PAIR, world.redstonePower(block.position) === 0);
                    return;
                default:
                    return;
            }
        },
        onPlayerInteract: (event, world) => {
            const block = event.block;
            switch (bareName(block.identifier)) {
                case 'tnt': {
                    if (!isIgniter(event.itemStack)) return undefined;
                    world.setBlock(block.position, AIR);
                    world.spawnEntity(block.position, 'minecraft:tnt', { fuse: TNT_FUSE_TICKS });
                    world.playSound(block.position, 'ignite');
                    world.notifyNeighbors(block.position);
                    return true;
                }
                case 'lever': {
                    const open = !stateBoolean(block, 'open_bit');
                    setStates(world, block, { open_bit: open });
                    world.playSound(block.position, 'random.click');
                    world.notifyNeighbors(block.position);
                    return true;
                }
                case 'powered_repeater':
                case 'unpowered_repeater':
                    setStates(world, block, { repeater_delay: (stateNumber(block, 'repeater_delay') + 1) % 4 });
                    world.playSound(block.position, 'random.click');
                    return true;
                case 'powered_comparator':
                case 'unpowered_comparator':
                    setStates(world, block, { output_subtract_bit: !stateBoolean(block, 'output_subtract_bit') });
                    world.playSound(block.position, 'random.click');
                    return true;
                case 'noteblock': {
                    const stored = world.getBlockData(block.position)?.['note'];
                    const note = (typeof stored === 'number' ? stored : 0) + 1;
                    world.setBlockData(block.position, { note: note % 25 });
                    world.playSound(block.position, 'note.harp');
                    return true;
                }
                case 'daylight_detector':
                case 'daylight_detector_inverted': {
                    const inverted = bareName(block.identifier) === 'daylight_detector';
                    world.setBlock(
                        block.position,
                        sibling(block.identifier, inverted ? 'daylight_detector_inverted' : 'daylight_detector'),
                        block.states
                    );
                    return true;
                }
                case 'jukebox': {
                    const data = world.getBlockData(block.position);
                    const record = data?.items?.[0];
                    if (record === undefined) return undefined;
                    world.dropItem(block.position, record);
                    world.setBlockData(block.position, { items: [undefined], capacity: 1 });
                    return true;
                }
                case 'lectern': {
                    const data = world.getBlockData(block.position);
                    const page = typeof data?.['page'] === 'number' ? data['page'] : 0;
                    world.setBlockData(block.position, { ...data, page: page + 1 });
                    setStates(world, block, { powered_bit: true });
                    world.scheduleTick(block.position, REDSTONE_TICK);
                    return true;
                }
                default:
                    return undefined;
            }
        },
        onBlockStateChange: (event, world) => {
            // A component whose own state changed is a change its neighbors
            // must see, which is how an observer in front of it fires.
            world.notifyNeighbors(event.block.position);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Buttons, which power the block they are on for a fixed time. */
export const buttonFamily = defineFamily(
    'jsprismarine:button',
    'Presses on interact, powers for 30 ticks on wood and 20 on stone, then releases on the scheduled tick.',
    {
        onPlayerInteract: (event, world, context) => {
            if (stateBoolean(event.block, 'button_pressed_bit')) return true;
            setStates(world, event.block, { button_pressed_bit: true });
            world.playSound(event.block.position, 'random.click');
            world.notifyNeighbors(event.block.position);
            const wooden = !bareName(context.identifier).startsWith('stone_');
            world.scheduleTick(event.block.position, BUTTON_PRESS_TICKS[wooden ? 'wooden' : 'stone']);
            return true;
        },
        onTick: (event, world) => {
            if (!stateBoolean(event.block, 'button_pressed_bit')) return;
            setStates(world, event.block, { button_pressed_bit: false });
            world.playSound(event.block.position, 'random.click');
            world.notifyNeighbors(event.block.position);
        },
        onNeighborChanged: (event, world) => {
            const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction'));
            if (face !== undefined) popWithoutSupport(world, event.block, opposite(face));
        }
    }
);

/** Pressure plates, including the two that count entities. */
export const pressurePlateFamily = defineFamily(
    'jsprismarine:pressure_plate',
    'Puts out redstone_signal while something stands on it, with the weighted plates counting entities, and releases on a scheduled tick.',
    {
        onStepOn: (event, world, context) => {
            const weight = PLATE_WEIGHTS[bareName(context.identifier)];
            const standing = world.entitiesAt(event.block.position).length;
            const signal = weight === undefined ? MAX_POWER : weightedPlateSignal(Math.max(standing, 1), weight);
            if (signal === stateNumber(event.block, 'redstone_signal')) return;
            setStates(world, event.block, { redstone_signal: signal });
            world.notifyNeighbors(event.block.position);
            world.scheduleTick(event.block.position, PRESSURE_PLATE_RELEASE_TICKS);
        },
        onTick: (event, world, context) => {
            const weight = PLATE_WEIGHTS[bareName(context.identifier)];
            const standing = world.entitiesAt(event.block.position).length;
            const signal =
                standing === 0 ? 0 : weight === undefined ? MAX_POWER : weightedPlateSignal(standing, weight);
            if (signal === stateNumber(event.block, 'redstone_signal')) {
                if (signal > 0) world.scheduleTick(event.block.position, PRESSURE_PLATE_RELEASE_TICKS);
                return;
            }
            setStates(world, event.block, { redstone_signal: signal });
            world.notifyNeighbors(event.block.position);
            if (signal > 0) world.scheduleTick(event.block.position, PRESSURE_PLATE_RELEASE_TICKS);
        },
        onNeighborChanged: (event, world) => {
            popWithoutSupport(world, event.block);
        }
    }
);

/** The ten rail shapes, and the power a powered rail carries. */
export const railFamily = defineFamily(
    'jsprismarine:rail',
    'Pops without a block below, and sets rail_data_bit on the powered rails from the signal reaching them.',
    {
        onPlace: (event, world) => {
            if (!isSolidSupport(world, offset(event.block.position, 'down'))) popWithoutSupport(world, event.block);
        },
        onNeighborChanged: (event, world) => {
            popWithoutSupport(world, event.block);
        },
        onRedstoneUpdate: (event, world) => {
            if (!hasState(event.block, 'rail_data_bit')) return;
            const powered = event.power > 0;
            if (powered !== stateBoolean(event.block, 'rail_data_bit')) {
                setStates(world, event.block, { rail_data_bit: powered });
            }
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);
