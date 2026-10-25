/**
 * The redstone component identifiers and the state names this package reads.
 *
 * Identifiers are Bedrock's, which is the runtime model the server keeps, and
 * that includes the places where Bedrock splits one Java block into a powered
 * and an unpowered identifier. Java's `RepeaterBlock` carries `powered` as a
 * state; Bedrock has `minecraft:powered_repeater` and
 * `minecraft:unpowered_repeater`, so this package writes whichever identifier
 * matches the new power.
 *
 * Two state names are this package's own rather than Bedrock's palette names,
 * because Bedrock encodes them as integers whose meaning differs per block:
 * {@link FACING_STATE} and {@link ATTACHMENT_STATE} both hold one of the
 * `Direction` strings. Everything else uses the palette's own name.
 */

import type { BlockRef, BlockStateValue, Direction } from './world';
import { DIRECTIONS, opposite } from './world';

/**
 * Which way a directional component points, holding a `Direction` string.
 *
 * It means what Java's `FACING` means for each block: a repeater or comparator
 * points at its input, so its output is the opposite way; an observer points at
 * the block it watches; a piston points the way it extends.
 */
export const FACING_STATE = 'facing_direction';

/**
 * Which way a wall-mounted component is attached, holding a `Direction` string:
 * the direction from the component toward the block holding it up.
 *
 * A torch on the floor is attached `down`; a torch on the east face of a block
 * is attached `east`. Java spells the same fact as `FACING` plus an
 * `AttachFace`, and reads it back through `getConnectedDirection`.
 */
export const ATTACHMENT_STATE = 'attachment_face';

/** Bedrock's own 0-to-15 power state, on wire, plates and daylight detectors. */
export const SIGNAL_STATE = 'redstone_signal';

/** Bedrock's own lever state. */
export const LEVER_OPEN_STATE = 'open_bit';

/** Bedrock's own button state. */
export const BUTTON_PRESSED_STATE = 'button_pressed_bit';

/** Bedrock's own observer state. */
export const OBSERVER_POWERED_STATE = 'powered_bit';

/** Bedrock's own repeater delay state, 0 through 3 for 2, 4, 6 and 8 game ticks. */
export const REPEATER_DELAY_STATE = 'repeater_delay';

/** Bedrock's own comparator mode state; true is subtract, false is compare. */
export const COMPARATOR_SUBTRACT_STATE = 'output_subtract_bit';

/** Bedrock's own piston extension state. */
export const PISTON_EXTENDED_STATE = 'extended_bit';

/** Redstone dust. */
export const REDSTONE_WIRE = 'minecraft:redstone_wire';

/** A block of redstone, which emits 15 weakly in every direction. */
export const REDSTONE_BLOCK = 'minecraft:redstone_block';

/** The lit and unlit redstone torch identifiers. */
export const REDSTONE_TORCH = { lit: 'minecraft:redstone_torch', unlit: 'minecraft:unlit_redstone_torch' } as const;

/** The powered and unpowered repeater identifiers. */
export const REPEATER = { powered: 'minecraft:powered_repeater', unpowered: 'minecraft:unpowered_repeater' } as const;

/** The powered and unpowered comparator identifiers. */
export const COMPARATOR = {
    powered: 'minecraft:powered_comparator',
    unpowered: 'minecraft:unpowered_comparator'
} as const;

/** The observer. */
export const OBSERVER = 'minecraft:observer';

/** A lever. */
export const LEVER = 'minecraft:lever';

/** The two piston identifiers. */
export const PISTON = { plain: 'minecraft:piston', sticky: 'minecraft:sticky_piston' } as const;

/** The extended piston arm, which is a separate block in both editions. */
export const PISTON_ARM = {
    plain: 'minecraft:piston_arm_collision',
    sticky: 'minecraft:sticky_piston_arm_collision'
} as const;

/** The block a pushed block becomes while it is in flight. */
export const MOVING_BLOCK = 'minecraft:moving_block';

/** The two blocks a piston can drag along with it, Java's `PistonStructureResolver.isSticky`. */
export const STICKY_BLOCKS = { slime: 'minecraft:slime', honey: 'minecraft:honey_block' } as const;

const isDirection = (value: BlockStateValue | undefined): value is Direction =>
    typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value);

/** The direction a component points, defaulting to `north` when the state is missing. */
export const facingOf = (block: BlockRef): Direction => {
    const value = block.states[FACING_STATE];
    return isDirection(value) ? value : 'north';
};

/** The direction toward a wall-mounted component's support, defaulting to `down`. */
export const attachmentOf = (block: BlockRef): Direction => {
    const value = block.states[ATTACHMENT_STATE];
    return isDirection(value) ? value : 'down';
};

/**
 * Java's `getConnectedDirection`: the direction a lever or button sticks out
 * from its support, which is the only direction it powers strongly.
 */
export const connectedDirectionOf = (block: BlockRef): Direction => opposite(attachmentOf(block));

/** A numeric state value, or the fallback when it is missing or not a number. */
export const numberState = (block: BlockRef, state: string, fallback = 0): number => {
    const value = block.states[state];
    return typeof value === 'number' ? value : fallback;
};

/** A boolean state value; the palette carries booleans as 0 and 1. */
export const booleanState = (block: BlockRef, state: string): boolean => {
    const value = block.states[state];
    return value === true || value === 1;
};

/** Whether the identifier is a button of any material. */
export const isButton = (name: string): boolean => name.endsWith('_button');

/** Whether the identifier is a pressure plate of any material or weight. */
export const isPressurePlate = (name: string): boolean => name.endsWith('_pressure_plate');

/** Whether the identifier is a daylight detector in either of its two states. */
export const isDaylightDetector = (name: string): boolean =>
    name === 'minecraft:daylight_detector' || name === 'minecraft:daylight_detector_inverted';

/** Whether the identifier is a repeater in either power state. */
export const isRepeater = (name: string): boolean => name === REPEATER.powered || name === REPEATER.unpowered;

/** Whether the identifier is a comparator in either power state. */
export const isComparator = (name: string): boolean => name === COMPARATOR.powered || name === COMPARATOR.unpowered;

/** Java's `DiodeBlock.isDiode`: a repeater or a comparator. */
export const isDiode = (name: string): boolean => isRepeater(name) || isComparator(name);

/** Whether the identifier is a piston base of either kind. */
export const isPiston = (name: string): boolean => name === PISTON.plain || name === PISTON.sticky;

/** Whether a diode or torch identifier is the powered one. */
export const isPoweredIdentifier = (name: string): boolean =>
    name === REPEATER.powered || name === COMPARATOR.powered || name === REDSTONE_TORCH.lit;
