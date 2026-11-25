/**
 * The state a player's placement puts a block in, Java's `Block.getStateForPlacement`.
 *
 * Java decides most of a placed block's state in one method per block class: which way a
 * furnace faces, whether a button sits on the floor or a wall, a sign's rotation, whether
 * leaves are persistent. A Bedrock client sends only the block it clicked, the face and where
 * the player looks, so the server has to make the same decision. Each rule here is one Java
 * class's method, written over Java's own block ids and property words; the placed Bedrock
 * block is read into Java's state through `@jsprismarine/mapping`, the rule runs, and the
 * result is mapped back, which is what spells each Bedrock block's own direction numbering and
 * picks a wall sign or a wall banner over the standing one.
 *
 * The blocks a family already places (stairs, slabs, doors, chests, dripstone, lanterns,
 * pillars) and the two the interaction path special-cases (pistons and torches) have no rule
 * here.
 *
 * @javaSee Block.getStateForPlacement
 */
import type { BlockFace, BlockPosition, BlockStateValue, FaceLocation } from '@jsprismarine/blocks';
import { bedrockBlockStateToJava, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { blocksTable } from '@jsprismarine/mapping/tables';

import type { HorizontalFace } from '../geometry';
import { offset, opposite } from '../geometry';
import { isReplaceable } from '../identifiers';
import type { WorldActions } from '../world';
import { placedHalf } from './placement';
import { isSolidSupport } from './support';

/** What one placement knows: the world, the position, the click and the placer's view. */
export interface PlacementInput {
    readonly world: WorldActions;
    /** Where the block goes. */
    readonly position: BlockPosition;
    /** The face of the block that was clicked, Java's `getClickedFace`. */
    readonly face: BlockFace;
    /** The placer's yaw in degrees, 0 looking south and 90 looking west. */
    readonly yaw: number;
    /** The placer's pitch in degrees, negative looking up. */
    readonly pitch: number;
    /** Whether the placer sneaks, Java's `isSecondaryUseActive`. */
    readonly sneaking: boolean;
    /** Whether the block replaces the one clicked rather than going against its face. */
    readonly replacingClicked: boolean;
}

/** A Java block state: its id and its property words. */
export interface JavaState {
    readonly name: string;
    readonly properties: Readonly<Record<string, string>>;
}

/** What a placement becomes in Bedrock's palette. */
export interface PlacedState {
    readonly identifier: string;
    readonly states: Record<string, BlockStateValue>;
}

/** One Java class's `getStateForPlacement`; null refuses the placement, as Java's does. */
type PlacementRule = (input: PlacementInput, java: JavaState) => JavaState | null;

const HORIZONTAL: readonly HorizontalFace[] = ['north', 'south', 'west', 'east'];
const isHorizontal = (face: BlockFace): face is HorizontalFace => HORIZONTAL.some((side) => side === face);

/**
 * The placer's horizontal direction, Java's `Direction.fromYRot`.
 *
 * @javaSource Direction.fromYRot
 */
const horizontalDirection = (yaw: number): HorizontalFace => {
    const quarter = Math.floor(yaw / 90 + 0.5) & 3;
    return (['south', 'west', 'north', 'east'] as const)[quarter] ?? 'south';
};

/**
 * The face a quarter turn clockwise, seen from above, Java's `Direction.getClockWise`.
 *
 * @javaSource Direction.getClockWise()Lnet/minecraft/core/Direction;
 */
const clockwise = (face: HorizontalFace): HorizontalFace =>
    (({ north: 'east', east: 'south', south: 'west', west: 'north' }) as const)[face];

/**
 * The six directions ordered by how near each is to where the placer looks, Java's
 * `Direction.orderedByNearest`.
 *
 * @javaSource Direction.orderedByNearest
 */
export const orderedByNearest = (yaw: number, pitch: number): readonly BlockFace[] => {
    const xRot = (pitch * Math.PI) / 180;
    const yRot = (-yaw * Math.PI) / 180;
    const pitchSin = Math.sin(xRot);
    const pitchCos = Math.cos(xRot);
    const yawSin = Math.sin(yRot);
    const yawCos = Math.cos(yRot);
    const xPos = yawSin > 0;
    const yPos = pitchSin < 0;
    const zPos = yawCos > 0;
    const xYaw = xPos ? yawSin : -yawSin;
    const yMag = yPos ? -pitchSin : pitchSin;
    const zYaw = zPos ? yawCos : -yawCos;
    const xMag = xYaw * pitchCos;
    const zMag = zYaw * pitchCos;
    const axisX: BlockFace = xPos ? 'east' : 'west';
    const axisY: BlockFace = yPos ? 'up' : 'down';
    const axisZ: BlockFace = zPos ? 'south' : 'north';
    const of = (a: BlockFace, b: BlockFace, c: BlockFace): readonly BlockFace[] => [
        a,
        b,
        c,
        opposite(c),
        opposite(b),
        opposite(a)
    ];
    if (xYaw > zYaw) {
        if (yMag > xMag) return of(axisY, axisX, axisZ);
        return zMag > yMag ? of(axisX, axisZ, axisY) : of(axisX, axisY, axisZ);
    }
    if (yMag > zMag) return of(axisY, axisZ, axisX);
    return xMag > yMag ? of(axisZ, axisX, axisY) : of(axisZ, axisY, axisX);
};

/**
 * The directions a placement tries, nearest to the look first, with the one into the clicked
 * block moved to the front unless the placement replaces the clicked block.
 *
 * @javaSource BlockPlaceContext.getNearestLookingDirections
 */
export const nearestLookingDirections = (input: PlacementInput): readonly BlockFace[] => {
    const ordered = orderedByNearest(input.yaw, input.pitch);
    if (input.replacingClicked) return ordered;
    const into = opposite(input.face);
    return [into, ...ordered.filter((face) => face !== into)];
};

/**
 * Java's `RotationSegment.convertToSegment`, sixteen segments of a turn.
 *
 * @javaSource RotationSegment.convertToSegment(F)I
 */
const rotationSegment = (degrees: number): number => Math.floor((degrees * 16) / 360 + 0.5) & 15;

/**
 * The sixteenth of a turn a standing sign, banner or head placed by a player at this yaw
 * faces: toward the placer.
 */
export const placedRotationSegment = (yaw: number): number => rotationSegment(yaw + 180);

/**
 * Whether the block across a face from the position holds something up. Below, Java asks for a
 * sturdy top face, which a bottom slab lacks; above, a full face, which only a full cube has
 * here. A world that cannot answer either falls back to the block being solid.
 */
const supports = (input: PlacementInput, face: BlockFace): boolean => {
    const position = offset(input.position, face);
    const block = input.world.getBlock(position);
    if (block !== undefined && face === 'down') {
        const sturdy = input.world.hasSturdyTopFace?.(block);
        if (sturdy !== undefined) return sturdy && isSolidSupport(input.world, position);
    }
    if (block !== undefined && face === 'up') {
        const full = input.world.isFullCube?.(block);
        if (full !== undefined) return full && isSolidSupport(input.world, position);
    }
    return isSolidSupport(input.world, position);
};

const withProperties = (java: JavaState, properties: Readonly<Record<string, string>>): JavaState => ({
    name: java.name,
    properties: { ...java.properties, ...properties }
});

/** A rule that sets `facing` from where the placer looks, as most horizontal blocks do. */
const horizontalFacing =
    (turn: (face: HorizontalFace) => HorizontalFace): PlacementRule =>
    (input, java) =>
        withProperties(java, { facing: turn(horizontalDirection(input.yaw)) });

/** A rule that sets `facing` from the direction nearest to the look, in all six directions. */
const nearestFacing =
    (turn: (face: BlockFace) => BlockFace): PlacementRule =>
    (input, java) =>
        withProperties(java, { facing: turn(orderedByNearest(input.yaw, input.pitch)[0] ?? 'north') });

/**
 * The first horizontal direction, nearest the look, whose `facing` the block can survive with,
 * as a wall sign, a ladder or a wall banner picks its wall.
 *
 * @param facingOf - Which way the block faces when it attaches toward a direction.
 * @param survives - Whether the block survives facing that way.
 */
const firstWall =
    (
        facingOf: (toward: HorizontalFace) => HorizontalFace,
        survives: (input: PlacementInput, toward: HorizontalFace) => boolean
    ): PlacementRule =>
    (input, java) => {
        for (const direction of nearestLookingDirections(input)) {
            if (!isHorizontal(direction) || !survives(input, direction)) continue;
            return withProperties(java, { facing: facingOf(direction) });
        }
        return null;
    };

/** A wall block survives with a block it can hang on behind it, toward the direction tried. */
const wallSupported = (input: PlacementInput, toward: HorizontalFace): boolean => supports(input, toward);

/**
 * Buttons, levers and grindstones: the first direction nearest the look whose block holds them,
 * the floor or ceiling turned the way the placer looks, or a wall faced away from.
 *
 * @javaSource FaceAttachedHorizontalDirectionalBlock.getStateForPlacement
 */
const faceAttached: PlacementRule = (input, java) => {
    for (const direction of nearestLookingDirections(input)) {
        if (direction === 'up' || direction === 'down') {
            if (!supports(input, direction)) continue;
            return withProperties(java, {
                face: direction === 'up' ? 'ceiling' : 'floor',
                facing: horizontalDirection(input.yaw)
            });
        }
        if (!supports(input, direction)) continue;
        return withProperties(java, { face: 'wall', facing: opposite(direction) });
    }
    return null;
};

/**
 * A bell: a floor or ceiling bell for a click on a top or bottom face, otherwise a wall bell,
 * hung between two walls when both sides hold it.
 *
 * @javaSource BellBlock.getStateForPlacement
 */
const bell: PlacementRule = (input, java) => {
    const clicked = input.face;
    if (clicked === 'up' || clicked === 'down') {
        const attachment = clicked === 'down' ? 'ceiling' : 'floor';
        if (!supports(input, clicked === 'down' ? 'up' : 'down')) return null;
        return withProperties(java, { attachment, facing: horizontalDirection(input.yaw) });
    }
    const facing = clicked;
    const axisSides: readonly [HorizontalFace, HorizontalFace] =
        facing === 'east' || facing === 'west' ? ['west', 'east'] : ['north', 'south'];
    const between = supports(input, axisSides[0]) && supports(input, axisSides[1]);
    const wall = withProperties(java, {
        facing: opposite(facing),
        attachment: between ? 'double_wall' : 'single_wall'
    });
    if (supports(input, opposite(facing))) return wall;
    const floor = supports(input, 'down');
    if (floor) return withProperties(wall, { attachment: 'floor' });
    return supports(input, 'up') ? withProperties(wall, { attachment: 'ceiling' }) : null;
};

/**
 * A ladder: refused against the side of a ladder facing the same way, otherwise the first wall
 * nearest the look.
 *
 * @javaSource LadderBlock.getStateForPlacement
 */
const ladder: PlacementRule = (input, java) => {
    if (!input.replacingClicked) {
        const clicked = input.world.getBlock(offset(input.position, opposite(input.face)));
        const clickedFacing =
            clicked === undefined ? undefined : javaStateOf(clicked.identifier, clicked.states)?.properties['facing'];
        if (clicked !== undefined && javaStateOf(clicked.identifier, clicked.states)?.name === java.name) {
            if (clickedFacing === input.face) return null;
        }
    }
    return firstWall(opposite, wallSupported)(input, java);
};

/**
 * An end rod faces the clicked face, or the other way when it goes against the end of a rod
 * already pointing that way.
 *
 * @javaSource EndRodBlock.getStateForPlacement
 */
const endRod: PlacementRule = (input, java) => {
    const behind = input.world.getBlock(offset(input.position, opposite(input.face)));
    const behindJava = behind === undefined ? undefined : javaStateOf(behind.identifier, behind.states);
    const flips = behindJava?.name === java.name && behindJava.properties['facing'] === input.face;
    return withProperties(java, { facing: flips ? opposite(input.face) : input.face });
};

/**
 * A crafter's front faces the placer, and its top is up unless the front is.
 *
 * @javaSource CrafterBlock.getStateForPlacement
 */
const crafter: PlacementRule = (input, java) => {
    const front = opposite(orderedByNearest(input.yaw, input.pitch)[0] ?? 'north');
    const horizontal = horizontalDirection(input.yaw);
    const top = front === 'down' ? opposite(horizontal) : front === 'up' ? horizontal : 'up';
    return withProperties(java, { orientation: `${front}_${top}` });
};

/**
 * The rotation a standing sign, banner or head takes: the segment the placer looks away from.
 *
 * @javaSource StandingSignBlock.getStateForPlacement
 */
const rotation = (input: PlacementInput, java: JavaState): JavaState =>
    withProperties(java, { rotation: String(placedRotationSegment(input.yaw)) });

/** A standing sign or banner stands on a block below it. */
const standingOnGround: PlacementRule = (input, java) => (supports(input, 'down') ? rotation(input, java) : null);

/**
 * A ceiling hanging sign hangs from the block above, turned to face the placer.
 *
 * @javaSource CeilingHangingSignBlock.getStateForPlacement
 */
const ceilingHangingSign: PlacementRule = (input, java) =>
    supports(input, 'up') ? withProperties(rotation(input, java), { attached: 'false' }) : null;

/**
 * A bed faces the way the placer looks, and needs room for its head in that direction.
 *
 * @javaSource AbstractBedBlock.getStateForPlacement
 */
const bed: PlacementRule = (input, java) => {
    const facing = horizontalDirection(input.yaw);
    const head = input.world.getBlock(offset(input.position, facing));
    return head !== undefined && isReplaceable(head.identifier) ? withProperties(java, { facing }) : null;
};

/**
 * A wall hanging sign hangs from a wall beside it, on an axis across the clicked face.
 *
 * @javaSource WallHangingSignBlock.getStateForPlacement
 */
const wallHangingSign: PlacementRule = (input, java) => {
    for (const direction of nearestLookingDirections(input)) {
        if (!isHorizontal(direction)) continue;
        if (isHorizontal(input.face) && (direction === input.face || direction === opposite(input.face))) continue;
        const facing = opposite(direction);
        if (supports(input, clockwise(facing)) || supports(input, opposite(clockwise(facing)))) {
            return withProperties(java, { facing });
        }
    }
    return null;
};

/**
 * The rules by the Java class whose `getStateForPlacement` each copies.
 *
 * @javaSource AnvilBlock.getStateForPlacement
 * @javaSource BarrelBlock.getStateForPlacement
 * @javaSource BeehiveBlock.getStateForPlacement
 * @javaSource BigDripleafBlock.getStateForPlacement
 * @javaSource CalibratedSculkSensorBlock.getStateForPlacement
 * @javaSource CarvedPumpkinBlock.getStateForPlacement
 * @javaSource ChiseledBookShelfBlock.getStateForPlacement
 * @javaSource CocoaBlock.getStateForPlacement
 * @javaSource CommandBlock.getStateForPlacement
 * @javaSource CopperGolemStatueBlock.getStateForPlacement
 * @javaSource DiodeBlock.getStateForPlacement
 * @javaSource RepeaterBlock.getStateForPlacement
 * @javaSource DispenserBlock.getStateForPlacement
 * @javaSource DriedGhastBlock.getStateForPlacement
 * @javaSource EndPortalFrameBlock.getStateForPlacement
 * @javaSource EnderChestBlock.getStateForPlacement
 * @javaSource GlazedTerracottaBlock.getStateForPlacement
 * @javaSource HopperBlock.getStateForPlacement
 * @javaSource LeavesBlock.getStateForPlacement
 * @javaSource LecternBlock.getStateForPlacement
 * @javaSource LightningRodBlock.getStateForPlacement
 * @javaSource AmethystClusterBlock.getStateForPlacement
 * @javaSource LoomBlock.getStateForPlacement
 * @javaSource ObserverBlock.getStateForPlacement
 * @javaSource BannerBlock.getStateForPlacement
 * @javaSource FlowerBedBlock.getStateForPlacement
 * @javaSource LeafLitterBlock.getStateForPlacement
 * @javaSource ShelfBlock.getStateForPlacement
 * @javaSource ShelfMushroomBlock.getStateForPlacement
 * @javaSource SkullBlock.getStateForPlacement
 * @javaSource SmallDripleafBlock.getStateForPlacement
 * @javaSource StonecutterBlock.getStateForPlacement
 * @javaSource TripWireHookBlock.getStateForPlacement
 * @javaSource VaultBlock.getStateForPlacement
 * @javaSource BaseCoralWallFanBlock.getStateForPlacement
 * @javaSource BaseCoralPlantTypeBlock.getStateForPlacement
 * @javaSource WallBannerBlock.getStateForPlacement
 * @javaSource WallSignBlock.getStateForPlacement
 * @javaSource WallSkullBlock.getStateForPlacement
 * @javaSource MangrovePropaguleBlock.getStateForPlacement
 */
const RULES = {
    AnvilBlock: horizontalFacing(clockwise),
    BarrelBlock: nearestFacing(opposite),
    BeehiveBlock: horizontalFacing(opposite),
    BellBlock: bell,
    BigDripleafBlock: horizontalFacing(opposite),
    CalibratedSculkSensorBlock: horizontalFacing((face) => face),
    CarvedPumpkinBlock: horizontalFacing(opposite),
    CeilingHangingSignBlock: ceilingHangingSign,
    ChiseledBookShelfBlock: horizontalFacing(opposite),
    CocoaBlock: firstWall(
        (toward) => toward,
        (input, toward) => {
            const log = input.world.getBlock(offset(input.position, toward));
            return log !== undefined && /jungle_(log|wood)$/.test(log.identifier);
        }
    ),
    CommandBlock: nearestFacing(opposite),
    CopperGolemStatueBlock: horizontalFacing(opposite),
    CrafterBlock: crafter,
    DiodeBlock: horizontalFacing(opposite),
    RepeaterBlock: horizontalFacing(opposite),
    DispenserBlock: nearestFacing(opposite),
    DriedGhastBlock: horizontalFacing(opposite),
    EndPortalFrameBlock: horizontalFacing(opposite),
    EndRodBlock: endRod,
    EnderChestBlock: horizontalFacing(opposite),
    FaceAttachedHorizontalDirectionalBlock: faceAttached,
    GlazedTerracottaBlock: horizontalFacing(opposite),
    HopperBlock: (input, java) =>
        withProperties(java, { facing: isHorizontal(input.face) ? opposite(input.face) : 'down' }),
    LadderBlock: ladder,
    LeavesBlock: (_input, java) => withProperties(java, { persistent: 'true' }),
    LecternBlock: horizontalFacing(opposite),
    LightningRodBlock: (input, java) => withProperties(java, { facing: input.face }),
    AmethystClusterBlock: (input, java) => withProperties(java, { facing: input.face }),
    LoomBlock: horizontalFacing(opposite),
    ObserverBlock: nearestFacing((face) => face),
    BannerBlock: standingOnGround,
    FlowerBedBlock: horizontalFacing(opposite),
    LeafLitterBlock: horizontalFacing(opposite),
    ShelfBlock: horizontalFacing(opposite),
    ShelfMushroomBlock: firstWall(opposite, wallSupported),
    SkullBlock: rotation,
    SmallDripleafBlock: horizontalFacing(opposite),
    StandingSignBlock: standingOnGround,
    StonecutterBlock: horizontalFacing(opposite),
    TripWireHookBlock: firstWall(opposite, wallSupported),
    VaultBlock: horizontalFacing(opposite),
    BaseCoralWallFanBlock: firstWall(opposite, wallSupported),
    WallBannerBlock: firstWall(opposite, wallSupported),
    WallHangingSignBlock: wallHangingSign,
    WallSignBlock: firstWall(opposite, wallSupported),
    WallSkullBlock: firstWall(opposite, (input, toward) => {
        const behind = input.world.getBlock(offset(input.position, toward));
        return behind !== undefined && !isReplaceable(behind.identifier);
    }),
    AbstractBedBlock: bed,
    BaseCoralPlantTypeBlock: (input, java) => (supports(input, 'down') ? java : null),
    MangrovePropaguleBlock: (_input, java) => withProperties(java, { age: '4' })
} as const satisfies Readonly<Record<string, PlacementRule>>;

/** The name of a Java class with a rule here. */
export type PlacementRuleName = keyof typeof RULES;

/** Every Java class with a rule here. */
export const PLACEMENT_RULE_NAMES: readonly string[] = Object.keys(RULES);

/** Java block ids by bare name: exact names, then suffixes, each naming the class it runs. */
const EXACT: Readonly<Record<string, PlacementRuleName>> = {
    barrel: 'BarrelBlock',
    bee_nest: 'BeehiveBlock',
    beehive: 'BeehiveBlock',
    bell: 'BellBlock',
    big_dripleaf: 'BigDripleafBlock',
    calibrated_sculk_sensor: 'CalibratedSculkSensorBlock',
    carved_pumpkin: 'CarvedPumpkinBlock',
    jack_o_lantern: 'CarvedPumpkinBlock',
    chiseled_bookshelf: 'ChiseledBookShelfBlock',
    cocoa: 'CocoaBlock',
    command_block: 'CommandBlock',
    chain_command_block: 'CommandBlock',
    repeating_command_block: 'CommandBlock',
    crafter: 'CrafterBlock',
    repeater: 'RepeaterBlock',
    comparator: 'DiodeBlock',
    dispenser: 'DispenserBlock',
    dropper: 'DispenserBlock',
    dried_ghast: 'DriedGhastBlock',
    end_portal_frame: 'EndPortalFrameBlock',
    end_rod: 'EndRodBlock',
    ender_chest: 'EnderChestBlock',
    lever: 'FaceAttachedHorizontalDirectionalBlock',
    grindstone: 'FaceAttachedHorizontalDirectionalBlock',
    hopper: 'HopperBlock',
    ladder: 'LadderBlock',
    lectern: 'LecternBlock',
    amethyst_cluster: 'AmethystClusterBlock',
    loom: 'LoomBlock',
    observer: 'ObserverBlock',
    pink_petals: 'FlowerBedBlock',
    wildflowers: 'FlowerBedBlock',
    leaf_litter: 'LeafLitterBlock',
    shelf_mushroom: 'ShelfMushroomBlock',
    small_dripleaf: 'SmallDripleafBlock',
    stonecutter: 'StonecutterBlock',
    tripwire_hook: 'TripWireHookBlock',
    vault: 'VaultBlock',
    mangrove_propagule: 'MangrovePropaguleBlock'
};

/** Suffix rules, longest first so a wall variant wins over its standing block. */
const SUFFIXES: readonly (readonly [string, PlacementRuleName])[] = [
    ['_wall_hanging_sign', 'WallHangingSignBlock'],
    ['_hanging_sign', 'CeilingHangingSignBlock'],
    ['_coral_wall_fan', 'BaseCoralWallFanBlock'],
    ['_coral_fan', 'BaseCoralPlantTypeBlock'],
    ['_coral', 'BaseCoralPlantTypeBlock'],
    ['_wall_banner', 'WallBannerBlock'],
    ['_wall_sign', 'WallSignBlock'],
    ['_wall_head', 'WallSkullBlock'],
    ['_wall_skull', 'WallSkullBlock'],
    ['_amethyst_bud', 'AmethystClusterBlock'],
    ['_glazed_terracotta', 'GlazedTerracottaBlock'],
    ['copper_golem_statue', 'CopperGolemStatueBlock'],
    ['lightning_rod', 'LightningRodBlock'],
    ['_button', 'FaceAttachedHorizontalDirectionalBlock'],
    ['_banner', 'BannerBlock'],
    ['_sign', 'StandingSignBlock'],
    ['_head', 'SkullBlock'],
    ['_skull', 'SkullBlock'],
    ['_leaves', 'LeavesBlock'],
    ['_shelf', 'ShelfBlock'],
    ['_bed', 'AbstractBedBlock'],
    ['anvil', 'AnvilBlock']
];

/**
 * The Java class whose placement rule a Java block runs, or undefined for a block with no rule
 * here. Parity checks it against the class each block constructs in the pinned server jar.
 */
export const placementRuleOf = (javaId: string): PlacementRuleName | undefined => {
    const bare = javaId.replace(/^minecraft:/, '');
    // A piston's head is placed by the piston, never by a player, and runs no rule.
    if (bare === 'piston_head') return undefined;
    const exact = EXACT[bare];
    if (exact !== undefined) return exact;
    return SUFFIXES.find(([suffix]) => bare.endsWith(suffix))?.[1];
};

/** A Bedrock block's Java state, or undefined for a block no Java block maps onto. */
const javaStateOf = (identifier: string, states: Readonly<Record<string, BlockStateValue>>): JavaState | undefined => {
    const mapped = bedrockBlockStateToJava(identifier, states);
    return mapped.kind === 'mapped' ? mapped.java : undefined;
};

/** The wall block a standing sign, banner, head or coral fan item also places, Java's `wallBlock`. */
const wallBlockOf = (javaId: string): string | undefined => {
    const candidates = [
        javaId.replace(/_hanging_sign$/, '_wall_hanging_sign'),
        javaId.replace(/_sign$/, '_wall_sign'),
        javaId.replace(/_banner$/, '_wall_banner'),
        javaId.replace(/_head$/, '_wall_head'),
        javaId.replace(/_skull$/, '_wall_skull'),
        javaId.replace(/_coral_fan$/, '_coral_wall_fan')
    ];
    return candidates.find((candidate) => candidate !== javaId && blocksTable.blocks[candidate] !== undefined);
};

/** Runs one block's rule, by its Java id. */
const runRule = (input: PlacementInput, java: JavaState): JavaState | null | undefined => {
    const name = placementRuleOf(java.name);
    return name === undefined ? undefined : RULES[name](input, java);
};

/** A Java block's default state. */
const defaultJavaState = (javaId: string): JavaState => ({ name: javaId, properties: {} });

/**
 * A standing-and-wall item, such as a sign, a banner, a head or a coral fan: the first
 * direction nearest the look that is not straight away from where the block attaches, placing
 * the standing block toward that attachment and the wall block anywhere else.
 *
 * @javaSource StandingAndWallBlockItem.getPlacementState
 */
const standingOrWall = (input: PlacementInput, standing: JavaState, wallId: string): JavaState | null => {
    const attachment: BlockFace = standing.name.endsWith('_hanging_sign') ? 'up' : 'down';
    const wall = runRule(input, defaultJavaState(wallId));
    for (const direction of nearestLookingDirections(input)) {
        if (direction === opposite(attachment)) continue;
        const state = direction === attachment ? runRule(input, standing) : wall;
        if (state !== null && state !== undefined) return state;
    }
    return null;
};

/**
 * The state a player's placement puts a Bedrock block in.
 *
 * @returns The block and states to place, null when Java would refuse the placement, or
 *   undefined for a block whose placement no rule here decides.
 */
export const placedStateOf = (
    identifier: string,
    states: Readonly<Record<string, BlockStateValue>>,
    input: PlacementInput
): PlacedState | null | undefined => {
    const java = javaStateOf(identifier, states);
    if (java === undefined) return undefined;
    const wallId = wallBlockOf(java.name);
    const placed =
        wallId !== undefined && placementRuleOf(wallId) !== undefined
            ? standingOrWall(input, java, wallId)
            : runRule(input, java);
    if (placed === undefined) return undefined;
    if (placed === null) return null;
    const bedrock = javaBlockStateToBedrock(placed.name, placed.properties);
    if (bedrock.kind !== 'mapped' && bedrock.kind !== 'loss') return undefined;
    // Bedrock's full state for the block placed: it may be another block than the one in hand,
    // a wall sign for a sign, so the hand's states do not carry over.
    return { identifier: bedrock.bedrock.name, states: { ...bedrock.bedrock.states } };
};

/**
 * The states with the half a click picks, for a slab's `minecraft:vertical_half` and a stair's
 * `upside_down_bit`, so a check made before the block is written, such as whether it overlaps
 * the placer, sees the half it will have. The families set the same half again in `onPlace`.
 */
export const withClickedHalf = (
    states: Readonly<Record<string, BlockStateValue>>,
    face: BlockFace,
    faceLocation: FaceLocation | undefined
): Record<string, BlockStateValue> => {
    const half = placedHalf({ face, faceLocation });
    if (half === undefined) return { ...states };
    return {
        ...states,
        ...('minecraft:vertical_half' in states ? { 'minecraft:vertical_half': half } : {}),
        ...('upside_down_bit' in states ? { upside_down_bit: half === 'top' } : {})
    };
};
