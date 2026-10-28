/**
 * The redstone families: the components themselves, buttons, pressure plates
 * and rails.
 *
 * `jsprismarine:redstone` covers 31 blocks that share no single rule, so the
 * family branches on the bare name once per hook. Each branch is small; what
 * they have in common is the power model in `rules/redstone.ts`.
 */
import { BLOCK_FACES } from '@jsprismarine/blocks';
import type { BlockFace, HookBlock } from '@jsprismarine/blocks';
import { javaBlockStates } from '@jsprismarine/mapping';

import { defineFamily } from '../family';
import { faceOfFacingDirection, offset, opposite, rotateClockwise, rotateCounterClockwise } from '../geometry';
import { AIR } from '../identifiers';
import { containerSignal } from '../rules/container';
import { isIgniter } from '../rules/heldItem';
import { performPull, performPush, planPush } from '../rules/piston';
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
import { bareName, hasState, setStates, sibling, stateBoolean, stateNumber, stateString } from '../state';
import type { BlockWorld, WorldActions } from '../world';
import { cardinalFacing } from './openable';
import { dropSelf } from './shared';

/** How long primed TNT burns before it goes off, in ticks. */
export const TNT_FUSE_TICKS = 80;

/** The two blocks a redstone lamp switches between. */
const LAMP_PAIR = { off: 'redstone_lamp', on: 'lit_redstone_lamp' } as const;

/** The two blocks a redstone torch switches between. */
const TORCH_PAIR = { off: 'unlit_redstone_torch', on: 'redstone_torch' } as const;

/** How long a redstone torch waits before acting on a support change. */
const TORCH_TOGGLE_TICKS = REDSTONE_TICK;

/** A torch burns out after this many off transitions in its recent window. */
const TORCH_MAX_RECENT_TOGGLES = 8;

/** The window used to count a redstone torch's off transitions. */
const TORCH_TOGGLE_WINDOW = 60;

/** How long a burnt-out torch waits before trying to light again. */
const TORCH_RESTART_TICKS = 160;

interface TorchToggle {
    readonly key: string;
    readonly tick: number;
}

const torchTogglesByWorld = new WeakMap<BlockWorld, TorchToggle[]>();

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

/** The Java-facing side of a piston, whose legacy Bedrock values reverse its horizontal direction. */
const pistonFacing = (block: HookBlock): BlockFace | undefined => {
    const facing = javaBlockStates(block.identifier, { facing_direction: stateNumber(block, 'facing_direction') })[
        'facing_direction'
    ];
    return typeof facing === 'string' ? BLOCK_FACES.find((face) => face === facing) : undefined;
};

/** Whether this is one of the two piston bases. */
const isPiston = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === 'piston' || name === 'sticky_piston';
};

/** The face the piston is mounted against, from Bedrock's `lever_direction`. */
const leverSupportFace = (block: HookBlock): BlockFace => {
    switch (stateString(block, 'lever_direction')) {
        case 'up_north_south':
        case 'up_east_west':
            return 'down';
        case 'down_north_south':
        case 'down_east_west':
            return 'up';
        case 'north':
            return 'south';
        case 'south':
            return 'north';
        case 'east':
            return 'west';
        case 'west':
            return 'east';
        default:
            return 'down';
    }
};

/** The strongest signal a block gives the piston from one direction. */
const pistonHasSignal = (world: WorldActions, position: HookBlock['position'], direction: BlockFace): boolean =>
    (world.redstoneSignal?.(position, direction) ?? world.redstonePower(position)) > 0;

/** Java's quasi-connectivity scan, expressed through the block world's redstone view. */
const pistonIsPowered = (world: WorldActions, block: HookBlock, pushDirection: BlockFace): boolean => {
    for (const direction of BLOCK_FACES) {
        if (direction === pushDirection) continue;
        if (pistonHasSignal(world, offset(block.position, direction), direction)) return true;
    }
    if (pistonHasSignal(world, block.position, 'down')) return true;

    const above = offset(block.position, 'up');
    for (const direction of BLOCK_FACES) {
        if (direction === 'down') continue;
        if (pistonHasSignal(world, offset(above, direction), direction)) return true;
    }
    return false;
};

/** Whether the matching piston head is in front of this piston base. */
const pistonHasHead = (world: WorldActions, block: HookBlock, facing: BlockFace): boolean => {
    const sticky = bareName(block.identifier) === 'sticky_piston';
    const headName = sticky ? 'sticky_piston_arm_collision' : 'piston_arm_collision';
    return bareName(world.getBlock(offset(block.position, facing))?.identifier ?? '') === headName;
};

/** Stores the static arm state the Bedrock client uses to draw an extended piston. */
const setPistonArmState = (world: WorldActions, block: HookBlock, extended: boolean): void => {
    const state = extended ? 2 : 0;
    world.setBlockData(block.position, {
        pistonArm: {
            progress: extended ? 1 : 0,
            lastProgress: extended ? 1 : 0,
            state,
            newState: state,
            sticky: bareName(block.identifier) === 'sticky_piston'
        }
    });
};

/** Tells each affected piston position's neighbors once the move is complete. */
const notifyPistonChanges = (world: WorldActions, positions: readonly HookBlock['position'][]): void => {
    const notified = new Set<string>();
    for (const position of positions) {
        const key = `${position.x},${position.y},${position.z}`;
        if (notified.has(key)) continue;
        notified.add(key);
        world.notifyNeighbors(position);
    }
};

/** Extends or retracts a piston to match its current signal and head. */
const updatePiston = (world: WorldActions, block: HookBlock, receivedPower?: number): void => {
    const facing = pistonFacing(block);
    if (facing === undefined) return;

    const powered =
        receivedPower === undefined
            ? pistonIsPowered(world, block, facing)
            : receivedPower > 0 || pistonIsPowered(world, block, facing);
    const extended = pistonHasHead(world, block, facing);
    if (powered === extended) return;

    const headPosition = offset(block.position, facing);
    if (powered) {
        const plan = planPush(world, block.position, facing);
        if (plan.blocked || !performPush(world, block.position, facing, false)) return;
        const head = sibling(
            block.identifier,
            bareName(block.identifier) === 'sticky_piston' ? 'sticky_piston_arm_collision' : 'piston_arm_collision'
        );
        world.setBlock(headPosition, head, { facing_direction: stateNumber(block, 'facing_direction') }, false);
        setPistonArmState(world, block, true);
        world.playSound(block.position, 'minecraft:piston.out');
        notifyPistonChanges(world, [
            block.position,
            headPosition,
            ...plan.moved.flatMap((position) => [position, offset(position, facing)]),
            ...plan.destroyedBlocks
        ]);
    } else {
        const sticky = bareName(block.identifier) === 'sticky_piston';
        world.setBlock(headPosition, AIR, undefined, false);
        const pulled = sticky && performPull(world, block.position, facing, false);
        setPistonArmState(world, block, false);
        world.playSound(block.position, 'minecraft:piston.in');
        notifyPistonChanges(
            world,
            pulled ? [block.position, headPosition, offset(block.position, facing, 2)] : [block.position, headPosition]
        );
    }
};

/** The face of the block supporting a torch, as Bedrock's `torch_facing_direction` spells it. */
const torchSupportFace = (block: HookBlock): BlockFace => {
    const facing = stateString(block, 'torch_facing_direction');
    switch (facing) {
        case 'north':
        case 'south':
        case 'east':
        case 'west':
            return facing;
        case 'top':
        case 'unknown':
        default:
            return 'down';
    }
};

/** Whether the block holding a redstone torch is powered. */
const torchIsSuppressed = (world: WorldActions, block: HookBlock): boolean =>
    world.redstonePower(offset(block.position, torchSupportFace(block))) > 0;

/** Whether a torch's current state disagrees with the signal at its support. */
const torchNeedsTick = (world: WorldActions, block: HookBlock): boolean =>
    (bareName(block.identifier) === TORCH_PAIR.on) === torchIsSuppressed(world, block);

/** Books one delayed inversion when a redstone torch's support signal changed. */
const scheduleTorchToggle = (world: WorldActions, block: HookBlock): void => {
    if (torchNeedsTick(world, block)) world.scheduleTick(block.position, TORCH_TOGGLE_TICKS);
};

/** Counts recent torch off transitions for one behavior world. */
const torchToggledTooOften = (world: BlockWorld, block: HookBlock, tick: number, record: boolean): boolean => {
    const key = `${block.dimension}:${block.position.x},${block.position.y},${block.position.z}`;
    const toggles = (torchTogglesByWorld.get(world) ?? []).filter(
        (toggle) => tick - toggle.tick <= TORCH_TOGGLE_WINDOW
    );
    if (record) toggles.push({ key, tick });
    torchTogglesByWorld.set(world, toggles);
    return toggles.filter((toggle) => toggle.key === key).length >= TORCH_MAX_RECENT_TOGGLES;
};

/** How many entities stand on a weighted plate per step of its signal. */
const PLATE_WEIGHTS: Readonly<Record<string, number>> = {
    light_weighted_pressure_plate: 1,
    heavy_weighted_pressure_plate: 10
};

/**
 * The signal from behind a comparator, including its analog block output.
 *
 * Containers answer with their fill level, and counter states answer with
 * their value. Redstone wire and other sources use the directional signal
 * path so a comparator reads only the face it points toward.
 */
export const comparatorInput = (world: WorldActions, block: HookBlock): number => {
    const output = cardinalFacing(block);
    const behind = offset(block.position, opposite(output));
    const inputBlock = world.getBlock(behind);
    const wireSignal =
        inputBlock !== undefined && bareName(inputBlock.identifier) === 'redstone_wire'
            ? stateNumber(inputBlock, 'redstone_signal')
            : 0;
    const signal = Math.max(
        wireSignal,
        world.redstoneSignal?.(behind, opposite(output)) ?? world.redstonePower(behind)
    );
    const analog = comparatorAnalogOutput(world, behind, inputBlock);
    if (analog !== undefined) return analog;

    if (signal < MAX_POWER && (world.redstoneConductor?.(behind) ?? false)) {
        const through = offset(behind, opposite(output));
        const throughBlock = world.getBlock(through);
        const throughAnalog = comparatorAnalogOutput(world, through, throughBlock);
        if (throughAnalog !== undefined) return throughAnalog;
    }

    return signal;
};

/** The analog output a comparator reads from a block or its block entity. */
const comparatorAnalogOutput = (
    world: WorldActions,
    position: HookBlock['position'],
    block: HookBlock | undefined
): number | undefined => {
    const data = world.getBlockData(position);
    if (typeof data?.analogOutput === 'number') return Math.min(MAX_POWER, Math.max(0, data.analogOutput));
    if (data?.items !== undefined) return containerSignal(data);
    if (block === undefined) return undefined;

    for (const state of [
        'composter_fill_level',
        'honey_level',
        'bite_counter',
        'fill_level',
        'respawn_anchor_charge'
    ]) {
        if (hasState(block, state)) return Math.min(MAX_POWER, stateNumber(block, state));
    }
    return undefined;
};

const isRepeater = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === REPEATER_PAIR.off || name === REPEATER_PAIR.on;
};

const isComparator = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === COMPARATOR_PAIR.off || name === COMPARATOR_PAIR.on;
};

/** The signal a diode reads from the block at its input. */
const diodeInputSignal = (world: WorldActions, block: HookBlock): number => {
    const output = cardinalFacing(block);
    const input = offset(block.position, opposite(output));
    const source = world.getBlock(input);
    const wireSignal =
        source !== undefined && bareName(source.identifier) === 'redstone_wire'
            ? stateNumber(source, 'redstone_signal')
            : 0;
    return Math.max(wireSignal, world.redstoneSignal?.(input, opposite(output)) ?? world.redstonePower(input));
};

/** The strongest direct signal from one side of a repeater or comparator. */
const diodeSideSignal = (world: WorldActions, block: HookBlock, side: 'repeater' | 'comparator'): number => {
    const facing = cardinalFacing(block);
    const sides = [rotateClockwise(facing), rotateCounterClockwise(facing)];
    let signal = 0;
    for (const face of sides) {
        const position = offset(block.position, face);
        const neighbor = world.getBlock(position);
        if (neighbor === undefined) continue;

        const name = bareName(neighbor.identifier);
        if (side === 'repeater') {
            if (isRepeater(neighbor.identifier) || isComparator(neighbor.identifier)) {
                signal = Math.max(
                    signal,
                    world.redstoneDirectSignal?.(position, face) ??
                        world.redstoneSignal?.(position, face) ??
                        world.redstonePower(position)
                );
            }
            continue;
        }

        if (name === 'redstone_block') {
            signal = MAX_POWER;
        } else if (name === 'redstone_wire') {
            signal = Math.max(signal, stateNumber(neighbor, 'redstone_signal'));
        } else {
            signal = Math.max(
                signal,
                world.redstoneDirectSignal?.(position, face) ??
                    world.redstoneSignal?.(position, face) ??
                    world.redstonePower(position)
            );
        }
    }
    return signal;
};

/** Whether a repeater is receiving the strong output of a diode on either side. */
const repeaterIsLocked = (world: WorldActions, block: HookBlock): boolean =>
    diodeSideSignal(world, block, 'repeater') > 0;

/** Whether a diode's output faces into the back or side of another diode. */
const diodeShouldPrioritize = (world: WorldActions, block: HookBlock): boolean => {
    const facing = cardinalFacing(block);
    const next = world.getBlock(offset(block.position, facing));
    return (
        next !== undefined &&
        (isRepeater(next.identifier) || isComparator(next.identifier)) &&
        cardinalFacing(next) !== opposite(facing)
    );
};

/** The comparator's analog result, after compare or subtract side input. */
const comparatorOutputSignal = (world: WorldActions, block: HookBlock): number => {
    const input = comparatorInput(world, block);
    if (input === 0) return 0;
    const side = diodeSideSignal(world, block, 'comparator');
    if (side > input) return 0;
    return stateBoolean(block, 'output_subtract_bit') ? input - side : input;
};

/** Whether a repeater or comparator currently wants to output power. */
const diodeShouldTurnOn = (world: WorldActions, block: HookBlock): boolean => {
    if (isRepeater(block.identifier)) return diodeInputSignal(world, block) > 0;
    const input = comparatorInput(world, block);
    if (input === 0) return false;
    const side = diodeSideSignal(world, block, 'comparator');
    if (input > side) return true;
    return input === side && !stateBoolean(block, 'output_subtract_bit');
};

/** Schedules a diode's delayed state transition when its current output is stale. */
const scheduleDiodeUpdate = (world: WorldActions, block: HookBlock): void => {
    const repeater = isRepeater(block.identifier);
    if (repeater && repeaterIsLocked(world, block)) return;
    if (!repeater && world.willTickThisTick?.(block.position)) return;

    const powered = bareName(block.identifier) === (repeater ? REPEATER_PAIR.on : COMPARATOR_PAIR.on);
    const shouldTurnOn = diodeShouldTurnOn(world, block);
    const delay = repeater ? (stateNumber(block, 'repeater_delay') + 1) * REDSTONE_TICK : REDSTONE_TICK;

    if (repeater) {
        if (powered === shouldTurnOn || world.willTickThisTick?.(block.position)) return;
        const priority = diodeShouldPrioritize(world, block) ? 'extremely_high' : powered ? 'very_high' : 'high';
        world.scheduleTick(block.position, delay, 'block', priority);
        return;
    }

    const output = comparatorOutputSignal(world, block);
    const data = world.getBlockData(block.position);
    const stored = typeof data?.comparatorOutput === 'number' ? data.comparatorOutput : 0;
    if (output === stored && powered === shouldTurnOn) return;
    world.scheduleTick(block.position, delay, 'block', diodeShouldPrioritize(world, block) ? 'high' : 'normal');
};

/** Changes a diode's powered identifier and notifies the output side. */
const swapDiodePower = (world: WorldActions, block: HookBlock, powered: boolean): void => {
    const pair = isRepeater(block.identifier) ? REPEATER_PAIR : COMPARATOR_PAIR;
    const wasPowered = bareName(block.identifier) === pair.on;
    if (wasPowered !== powered) swapPair(world, block, pair, powered);
    world.notifyNeighbors(offset(block.position, cardinalFacing(block)));
};

const onRedstone = (event: { block: HookBlock; power: number }, world: WorldActions): void => {
    const block = event.block;
    const powered = event.power > 0;

    switch (bareName(block.identifier)) {
        case 'piston':
        case 'sticky_piston': {
            updatePiston(world, block, event.power);
            return;
        }
        case 'redstone_lamp':
        case 'lit_redstone_lamp':
            swapPair(world, block, LAMP_PAIR, powered);
            return;
        case 'redstone_torch':
        case 'unlit_redstone_torch':
            scheduleTorchToggle(world, block);
            return;
        case 'powered_repeater':
        case 'unpowered_repeater':
        case 'powered_comparator':
        case 'unpowered_comparator':
            scheduleDiodeUpdate(world, block);
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
        onPlace: (event, world) => {
            const block = event.block;
            const name = bareName(block.identifier);
            if (name === TORCH_PAIR.on || name === TORCH_PAIR.off) {
                if (popWithoutSupport(world, block, torchSupportFace(block))) return;
                scheduleTorchToggle(world, block);
                for (const direction of BLOCK_FACES) world.notifyNeighbors(offset(block.position, direction));
                return;
            }
            if (name === 'redstone_wire') {
                if (popWithoutSupport(world, block)) return;
                const signal = wireSignal(world, block);
                if (signal !== stateNumber(block, 'redstone_signal'))
                    setStates(world, block, { redstone_signal: signal });
                return;
            }
            if (name === 'lever') {
                const support = leverSupportFace(block);
                if (popWithoutSupport(world, block, support)) return;
                world.notifyNeighbors(offset(block.position, support));
                return;
            }
            if (isRepeater(block.identifier) || isComparator(block.identifier)) {
                scheduleDiodeUpdate(world, block);
                world.notifyNeighbors(offset(block.position, cardinalFacing(block)));
                return;
            }
            if (isPiston(block.identifier)) updatePiston(world, block);
        },
        onRedstoneUpdate: (event, world) => {
            onRedstone(event, world);
        },
        onNeighborChanged: (event, world) => {
            const block = event.block;
            const name = bareName(block.identifier);

            if (isRepeater(block.identifier) || isComparator(block.identifier)) {
                scheduleDiodeUpdate(world, block);
                return;
            }

            if (name === 'redstone_wire') {
                if (popWithoutSupport(world, block)) return;
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
                    world.scheduleTick(block.position, OBSERVER_PULSE_TICKS);
                }
                return;
            }

            if (name === 'lever') {
                popWithoutSupport(world, block, leverSupportFace(block));
                return;
            }

            if (isPiston(block.identifier)) {
                updatePiston(world, block);
                return;
            }

            if (name.endsWith('_torch')) {
                if (popWithoutSupport(world, block, torchSupportFace(block))) return;
                scheduleTorchToggle(world, block);
            }
        },
        onTick: (event, world, context) => {
            const block = event.block;
            switch (bareName(block.identifier)) {
                case 'observer': {
                    const powered = stateBoolean(block, 'powered_bit');
                    setStates(world, block, { powered_bit: !powered });
                    world.notifyNeighbors(block.position);
                    if (!powered) world.scheduleTick(block.position, OBSERVER_PULSE_TICKS);
                    return;
                }
                case 'powered_repeater':
                case 'unpowered_repeater': {
                    if (repeaterIsLocked(world, block)) return;
                    const powered = bareName(block.identifier) === REPEATER_PAIR.on;
                    const shouldTurnOn = diodeShouldTurnOn(world, block);
                    if (powered && !shouldTurnOn) {
                        swapDiodePower(world, block, false);
                    } else if (!powered) {
                        swapDiodePower(world, block, true);
                        if (!shouldTurnOn) {
                            world.scheduleTick(
                                block.position,
                                (stateNumber(block, 'repeater_delay') + 1) * REDSTONE_TICK,
                                'block',
                                'very_high'
                            );
                        }
                    }
                    return;
                }
                case 'powered_comparator':
                case 'unpowered_comparator': {
                    const output = comparatorOutputSignal(world, block);
                    const previousData = world.getBlockData(block.position);
                    const previousOutput =
                        typeof previousData?.comparatorOutput === 'number' ? previousData.comparatorOutput : 0;
                    world.setBlockData(block.position, { ...previousData, signal: output, comparatorOutput: output });

                    if (previousOutput === output && stateBoolean(block, 'output_subtract_bit')) return;

                    swapDiodePower(world, block, diodeShouldTurnOn(world, block));
                    const current = world.getBlock(block.position) ?? block;
                    if (stateBoolean(current, 'output_lit_bit') !== output > 0) {
                        setStates(world, current, { output_lit_bit: output > 0 });
                    }
                    return;
                }
                case 'redstone_torch':
                case 'unlit_redstone_torch': {
                    const lit = bareName(block.identifier) === TORCH_PAIR.on;
                    const suppressed = torchIsSuppressed(world, block);
                    if (lit !== suppressed) return;

                    if (lit) {
                        swapPair(world, block, TORCH_PAIR, false);
                        if (torchToggledTooOften(context.world, block, event.tick, true)) {
                            world.playSound(block.position, 'minecraft:random.fizz');
                            world.scheduleTick(block.position, TORCH_RESTART_TICKS);
                        }
                        return;
                    }

                    if (!torchToggledTooOften(context.world, block, event.tick, false)) {
                        swapPair(world, block, TORCH_PAIR, true);
                    }
                    return;
                }
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
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
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
        onPlace: (event, world) => {
            const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction'));
            if (face === undefined) return;
            const support = opposite(face);
            if (popWithoutSupport(world, event.block, support)) return;
            world.notifyNeighbors(offset(event.block.position, support));
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
        onPlace: (event, world) => {
            if (popWithoutSupport(world, event.block)) return;
            world.notifyNeighbors(offset(event.block.position, 'down'));
        },
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
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);
