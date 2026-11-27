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
import { BLOCK_FACES } from '@jsprismarine/blocks';
import { bedrockBlockStateToJava, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { blocksTable } from '@jsprismarine/mapping/tables';

import type { HorizontalFace } from '../geometry';
import { offset, opposite } from '../geometry';
import { isReplaceable } from '../identifiers';
import { mthCos, mthSin } from '../mth';
import type { WorldActions } from '../world';
import { isLogName } from './growth';
import { placedHalf } from './placement';
import type { AttachmentNeed } from './support';
import { isAttachedToward, isFaceSturdyAt, isSolidSupport } from './support';

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
 * @javaVerified vectors
 */
const horizontalDirection = (yaw: number): HorizontalFace => {
    const quarter = Math.floor(yaw / 90 + 0.5) & 3;
    return (['south', 'west', 'north', 'east'] as const)[quarter] ?? 'south';
};

/**
 * The face a quarter turn clockwise, seen from above, Java's `Direction.getClockWise`.
 *
 * @javaSource Direction.getClockWise()Lnet/minecraft/core/Direction;
 * @javaVerified vectors
 */
const clockwise = (face: HorizontalFace): HorizontalFace =>
    (({ north: 'east', east: 'south', south: 'west', west: 'north' }) as const)[face];

/** Java's `(float) (Math.PI / 180.0)`, the degrees-to-radians factor `orderedByNearest` multiplies by. */
const RADIANS_PER_DEGREE = Math.fround(Math.PI / 180);

/**
 * The six directions ordered by how near each is to where the placer looks, Java's
 * `Direction.orderedByNearest`.
 *
 * @javaSource Direction.orderedByNearest
 * @javaVerified vectors
 */
export const orderedByNearest = (yaw: number, pitch: number): readonly BlockFace[] => {
    // Java works in single precision and reads its sine table, which is what settles a look
    // exactly between two directions.
    const xRot = Math.fround(Math.fround(pitch) * RADIANS_PER_DEGREE);
    const yRot = Math.fround(-Math.fround(yaw) * RADIANS_PER_DEGREE);
    const pitchSin = mthSin(xRot);
    const pitchCos = mthCos(xRot);
    const yawSin = mthSin(yRot);
    const yawCos = mthCos(yRot);
    const xPos = yawSin > 0;
    const yPos = pitchSin < 0;
    const zPos = yawCos > 0;
    const xYaw = xPos ? yawSin : -yawSin;
    const yMag = yPos ? -pitchSin : pitchSin;
    const zYaw = zPos ? yawCos : -yawCos;
    const xMag = Math.fround(xYaw * pitchCos);
    const zMag = Math.fround(zYaw * pitchCos);
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
 * @javaVerified vectors
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
 * @javaVerified vectors
 */
const rotationSegment = (degrees: number): number => Math.floor((degrees * 16) / 360 + 0.5) & 15;

/**
 * The sixteenth of a turn a standing sign, banner or head placed by a player at this yaw
 * faces: toward the placer.
 */
export const placedRotationSegment = (yaw: number): number => rotationSegment(yaw + 180);

/**
 * Whether the block across a face from the position holds a block there that needs `needs`, the
 * question each block's Java survival rule asks: the solid flag for a sign or a banner, a full
 * sturdy face for a ladder or a lever, a sturdy center for a lantern or a hanging bell.
 */
const supports = (input: PlacementInput, toward: BlockFace, needs: AttachmentNeed): boolean =>
    isAttachedToward(input.world, input.position, toward, needs);

/**
 * Whether redstone power reaches the position, as Java's placement asks of the level.
 *
 * @javaSee SignalGetter.hasNeighborSignal
 */
const powered = (input: PlacementInput): boolean => input.world.redstonePower(input.position) > 0;

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

/**
 * A ladder, a coral wall fan, a tripwire hook or a shelf mushroom survives against a block whose
 * face toward it is sturdy.
 *
 * @javaSource LadderBlock.canAttachTo
 * @javaSource BaseCoralWallFanBlock.canSurvive
 * @javaSource TripWireHookBlock.canSurvive
 * @javaSource ShelfMushroomBlock.canSurvive
 * @javaVerified vectors
 */
const onSturdyWall = (input: PlacementInput, toward: HorizontalFace): boolean => supports(input, toward, 'full');

/**
 * A wall sign or a wall banner survives against a block Java calls solid.
 *
 * @javaSource WallSignBlock.canSurvive
 * @javaSource WallBannerBlock.canSurvive
 * @javaVerified vectors
 */
const onSolidWall = (input: PlacementInput, toward: HorizontalFace): boolean => supports(input, toward, 'solid');

/**
 * Whether a button, lever or grindstone attached toward a direction survives: a button or a lever
 * needs a sturdy face there, and a grindstone survives anywhere.
 *
 * @javaSource FaceAttachedHorizontalDirectionalBlock.canSurvive
 * @javaSource GrindstoneBlock.canSurvive
 * @javaVerified vectors
 */
const faceAttachedSurvives = (input: PlacementInput, java: JavaState, toward: BlockFace): boolean =>
    java.name === 'minecraft:grindstone' || supports(input, toward, 'full');

/**
 * Buttons, levers and grindstones: the first direction nearest the look they survive attached
 * toward, the floor or ceiling turned the way the placer looks, or a wall faced away from.
 *
 * @javaSource FaceAttachedHorizontalDirectionalBlock.getStateForPlacement
 * @javaVerified vectors
 */
const faceAttached: PlacementRule = (input, java) => {
    for (const direction of nearestLookingDirections(input)) {
        if (!faceAttachedSurvives(input, java, direction)) continue;
        if (direction === 'up' || direction === 'down') {
            return withProperties(java, {
                face: direction === 'up' ? 'ceiling' : 'floor',
                facing: horizontalDirection(input.yaw)
            });
        }
        return withProperties(java, { face: 'wall', facing: opposite(direction) });
    }
    return null;
};

/**
 * Whether a bell survives toward a direction: a ceiling bell needs a sturdy center above it, and
 * a floor or wall bell a sturdy face.
 *
 * @javaSource BellBlock.canSurvive
 * @javaVerified vectors
 */
const bellHeldToward = (input: PlacementInput, toward: BlockFace): boolean =>
    supports(input, toward, toward === 'up' ? 'center' : 'full');

/**
 * A bell: a floor or ceiling bell for a click on a top or bottom face, otherwise a wall bell,
 * hung between two walls when both sides have sturdy faces toward it.
 *
 * @javaSource BellBlock.getStateForPlacement
 * @javaVerified vectors
 */
const bell: PlacementRule = (input, java) => {
    const clicked = input.face;
    if (clicked === 'up' || clicked === 'down') {
        const attachment = clicked === 'down' ? 'ceiling' : 'floor';
        if (!bellHeldToward(input, clicked === 'down' ? 'up' : 'down')) return null;
        return withProperties(java, { attachment, facing: horizontalDirection(input.yaw) });
    }
    const facing = clicked;
    const axisSides: readonly [HorizontalFace, HorizontalFace] =
        facing === 'east' || facing === 'west' ? ['west', 'east'] : ['north', 'south'];
    const between = supports(input, axisSides[0], 'full') && supports(input, axisSides[1], 'full');
    const wall = withProperties(java, {
        facing: opposite(facing),
        attachment: between ? 'double_wall' : 'single_wall'
    });
    if (bellHeldToward(input, opposite(facing))) return wall;
    if (supports(input, 'down', 'full')) return withProperties(wall, { attachment: 'floor' });
    return bellHeldToward(input, 'up') ? withProperties(wall, { attachment: 'ceiling' }) : null;
};

/**
 * A ladder: refused against the side of a ladder facing the same way, otherwise the first wall
 * nearest the look.
 *
 * @javaSource LadderBlock.getStateForPlacement
 * @javaVerified vectors
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
    return firstWall(opposite, onSturdyWall)(input, java);
};

/**
 * An end rod faces the clicked face, or the other way when it goes against the end of a rod
 * already pointing that way.
 *
 * @javaSource EndRodBlock.getStateForPlacement
 * @javaVerified vectors
 */
const endRod: PlacementRule = (input, java) => {
    const behind = input.world.getBlock(offset(input.position, opposite(input.face)));
    const behindJava = behind === undefined ? undefined : javaStateOf(behind.identifier, behind.states);
    const flips = behindJava?.name === java.name && behindJava.properties['facing'] === input.face;
    return withProperties(java, { facing: flips ? opposite(input.face) : input.face });
};

/**
 * A crafter's front faces the placer, and its top is up unless the front is. It starts triggered
 * when it is placed powered.
 *
 * @javaSource CrafterBlock.getStateForPlacement
 * @javaVerified vectors
 */
const crafter: PlacementRule = (input, java) => {
    const front = opposite(orderedByNearest(input.yaw, input.pitch)[0] ?? 'north');
    const horizontal = horizontalDirection(input.yaw);
    const top = front === 'down' ? opposite(horizontal) : front === 'up' ? horizontal : 'up';
    return withProperties(java, { orientation: `${front}_${top}`, triggered: String(powered(input)) });
};

/**
 * The rotation a standing sign or banner takes: the segment the placer looks away from.
 *
 * @javaSource StandingSignBlock.getStateForPlacement
 * @javaVerified vectors
 */
const rotation = (input: PlacementInput, java: JavaState): JavaState =>
    withProperties(java, { rotation: String(placedRotationSegment(input.yaw)) });

/**
 * A standing sign or banner stands on a block below it that Java calls solid.
 *
 * @javaSource StandingSignBlock.canSurvive
 * @javaSource BannerBlock.canSurvive
 * @javaVerified vectors
 */
const standingOnGround: PlacementRule = (input, java) =>
    supports(input, 'down', 'solid') ? rotation(input, java) : null;

/**
 * The compass direction a sixteenth of a turn points, for the four that point one.
 *
 * @javaSource RotationSegment.convertToDirection
 * @javaVerified vectors
 */
const SEGMENT_DIRECTIONS: Readonly<Record<string, HorizontalFace>> = { 0: 'north', 4: 'east', 8: 'south', 12: 'west' };

/**
 * The sixteenth of a turn a compass direction points.
 *
 * @javaSource RotationSegment.convertToSegment(Lnet/minecraft/core/Direction;)I
 * @javaVerified vectors
 */
const SEGMENT_OF: Readonly<Record<HorizontalFace, number>> = { south: 0, west: 4, north: 8, east: 12 };

/** Whether two horizontal directions lie on one axis. */
const sameAxis = (a: HorizontalFace, b: HorizontalFace): boolean => a === b || a === opposite(b);

/**
 * A ceiling hanging sign hangs from the block above, whose underside holds it at its center. It
 * hangs from a chain on each side,
 * squared to the four directions and facing the placer, under a block with a full underside;
 * under anything else, or for a sneaking placer, it is attached by one chain and turns to any of
 * the sixteenth turns. It also hangs under another hanging sign, and keeps the two chains under
 * one on the same axis.
 *
 * @javaSource CeilingHangingSignBlock.getStateForPlacement
 * @javaSource CeilingHangingSignBlock.canSurvive
 * @javaVerified vectors
 */
const ceilingHangingSign: PlacementRule = (input, java) => {
    const abovePosition = offset(input.position, 'up');
    const aboveBlock = input.world.getBlock(abovePosition);
    const above = aboveBlock === undefined ? undefined : javaStateOf(aboveBlock.identifier, aboveBlock.states);
    // A hanging sign holds another below it.
    if (!supports(input, 'up', 'center') && above?.name.endsWith('_hanging_sign') !== true) return null;
    const direction = horizontalDirection(input.yaw);
    const fullUnderside =
        aboveBlock !== undefined &&
        (input.world.isFullCube?.(aboveBlock) ?? isSolidSupport(input.world, abovePosition));
    let attached = !fullUnderside || input.sneaking;
    if (above?.name.endsWith('_hanging_sign') === true && !input.sneaking) {
        const facing = above.properties['facing'];
        const facingAbove = HORIZONTAL.find((side) => side === facing);
        const rotated = SEGMENT_DIRECTIONS[above.properties['rotation'] ?? ''];
        const along = facing === undefined ? rotated : facingAbove;
        if (along !== undefined && sameAxis(along, direction)) attached = false;
    }
    const segment = attached ? placedRotationSegment(input.yaw) : SEGMENT_OF[opposite(direction)];
    return withProperties(java, { attached: String(attached), rotation: String(segment) });
};

/**
 * A bed faces the way the placer looks, and needs room for its head in that direction.
 *
 * @javaSource AbstractBedBlock.getStateForPlacement
 * @javaVerified vectors
 */
const bed: PlacementRule = (input, java) => {
    const facing = horizontalDirection(input.yaw);
    const head = input.world.getBlock(offset(input.position, facing));
    return head !== undefined && isReplaceable(head.identifier) ? withProperties(java, { facing }) : null;
};

/**
 * Whether a wall hanging sign facing a way can hang from the block on one side: another wall
 * hanging sign on the same axis, or a block whose face toward the sign is sturdy.
 *
 * @javaSource WallHangingSignBlock.canAttachTo
 * @javaVerified vectors
 */
const hangsFrom = (input: PlacementInput, facing: HorizontalFace, side: HorizontalFace): boolean => {
    const position = offset(input.position, side);
    const block = input.world.getBlock(position);
    if (block === undefined) return false;
    const java = javaStateOf(block.identifier, block.states);
    if (java?.name.endsWith('_wall_hanging_sign') === true) {
        const along = HORIZONTAL.find((face) => face === java.properties['facing']);
        return along !== undefined && sameAxis(along, facing);
    }
    return isFaceSturdyAt(input.world, position, opposite(side));
};

/**
 * A wall hanging sign hangs from a wall beside it, on an axis across the clicked face.
 *
 * @javaSource WallHangingSignBlock.getStateForPlacement
 * @javaSource WallHangingSignBlock.canPlace
 * @javaVerified vectors
 */
const wallHangingSign: PlacementRule = (input, java) => {
    for (const direction of nearestLookingDirections(input)) {
        if (!isHorizontal(direction)) continue;
        if (isHorizontal(input.face) && sameAxis(direction, input.face)) continue;
        const facing = opposite(direction);
        if (hangsFrom(input, facing, clockwise(facing)) || hangsFrom(input, facing, opposite(clockwise(facing)))) {
            return withProperties(java, { facing });
        }
    }
    return null;
};

/** The Java state of the block beside a position, or undefined for one no Java block maps onto. */
const javaNeighbor = (input: PlacementInput, face: BlockFace): JavaState | undefined => {
    const block = input.world.getBlock(offset(input.position, face));
    return block === undefined ? undefined : javaStateOf(block.identifier, block.states);
};

/**
 * A big dripleaf continues the facing of the dripleaf or stem it grows on, and otherwise faces
 * the placer.
 *
 * @javaSource BigDripleafBlock.getStateForPlacement
 * @javaVerified vectors
 */
const bigDripleaf: PlacementRule = (input, java) => {
    const below = javaNeighbor(input, 'down');
    const continued =
        below?.name === 'minecraft:big_dripleaf' || below?.name === 'minecraft:big_dripleaf_stem'
            ? HORIZONTAL.find((side) => side === below.properties['facing'])
            : undefined;
    return withProperties(java, { facing: continued ?? opposite(horizontalDirection(input.yaw)) });
};

/**
 * A small dripleaf is two blocks tall, so it needs room above for its top, as Java's
 * `DoublePlantBlock` asks, and faces the placer.
 *
 * @javaSource SmallDripleafBlock.getStateForPlacement
 * @javaVerified vectors
 */
const smallDripleaf: PlacementRule = (input, java) => {
    const above = input.world.getBlock(offset(input.position, 'up'));
    if (above === undefined || !isReplaceable(above.identifier)) return null;
    return withProperties(java, { facing: opposite(horizontalDirection(input.yaw)) });
};

/**
 * A head or skull on the ground turns with the placer's yaw, unlike a sign, and is powered when
 * redstone reaches it.
 *
 * @javaSource SkullBlock.getStateForPlacement
 * @javaSource AbstractSkullBlock.getStateForPlacement
 * @javaVerified vectors
 */
const skull: PlacementRule = (input, java) =>
    withProperties(java, { rotation: String(rotationSegment(input.yaw)), powered: String(powered(input)) });

/** A wall head hangs on the first wall nearest the look with a block that is not replaceable. */
const wallHeadFirstWall = firstWall(opposite, (input, toward) => {
    const behind = input.world.getBlock(offset(input.position, toward));
    return behind !== undefined && !isReplaceable(behind.identifier);
});

/**
 * A head or skull on a wall faces away from the first wall nearest the look that is not
 * replaceable, and is powered when redstone reaches it.
 *
 * @javaSource WallSkullBlock.getStateForPlacement
 * @javaVerified vectors
 */
const wallSkull: PlacementRule = (input, java) =>
    wallHeadFirstWall(input, withProperties(java, { powered: String(powered(input)) }));

/** The distance Java gives a log, and the one it gives a block that is neither log nor leaves. */
const LOG_DISTANCE = 0;
const NO_DISTANCE = 7;

/**
 * Placed leaves are persistent, and take their distance from the log or leaves beside them: one
 * more than the nearest, a log counting as 0 and anything else as 7.
 *
 * @javaSource LeavesBlock.getStateForPlacement
 * @javaSource LeavesBlock.updateDistance
 * @javaSource LeavesBlock.getOptionalDistanceAt
 * @javaVerified vectors
 */
const leaves: PlacementRule = (input, java) => {
    let distance = NO_DISTANCE;
    for (const face of BLOCK_FACES) {
        const neighbor = javaNeighbor(input, face);
        if (neighbor === undefined) continue;
        const own = isLogName(neighbor.name) ? LOG_DISTANCE : Number(neighbor.properties['distance'] ?? NO_DISTANCE);
        distance = Math.min(distance, own + 1);
        if (distance === 1) break;
    }
    return withProperties(java, { persistent: 'true', distance: String(distance) });
};

/** The properties that count a flower bed's flowers and leaf litter's leaves. */
const SEGMENT_AMOUNTS = ['flower_amount', 'segment_amount'] as const;

/**
 * A flower bed or leaf litter placed into one of its own kind adds a segment to it, up to four,
 * and otherwise faces the placer.
 *
 * @javaSource SegmentableBlock.getStateForPlacement
 * @javaVerified vectors
 */
const segmented: PlacementRule = (input, java) => {
    const here = input.world.getBlock(input.position);
    const existing = here === undefined ? undefined : javaStateOf(here.identifier, here.states);
    if (existing?.name === java.name) {
        const amount = SEGMENT_AMOUNTS.find((name) => existing.properties[name] !== undefined);
        if (amount !== undefined) {
            const count = Math.min(4, Number(existing.properties[amount]) + 1);
            return withProperties(existing, { [amount]: String(count) });
        }
    }
    return withProperties(java, { facing: opposite(horizontalDirection(input.yaw)) });
};

/**
 * A coral or a coral fan stands on a block whose top face is sturdy.
 *
 * @javaSource BaseCoralPlantTypeBlock.canSurvive
 * @javaVerified vectors
 */
const coralPlant: PlacementRule = (input, java) => (supports(input, 'down', 'full') ? java : null);

/**
 * The rules by the Java class whose `getStateForPlacement` each copies.
 *
 * @javaSource AnvilBlock.getStateForPlacement
 * @javaSource BarrelBlock.getStateForPlacement
 * @javaSource BeehiveBlock.getStateForPlacement
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
 * @javaSource StonecutterBlock.getStateForPlacement
 * @javaSource TripWireHookBlock.getStateForPlacement
 * @javaSource VaultBlock.getStateForPlacement
 * @javaSource BaseCoralWallFanBlock.getStateForPlacement
 * @javaSource BaseCoralPlantTypeBlock.getStateForPlacement
 * @javaSource WallBannerBlock.getStateForPlacement
 * @javaSource WallSignBlock.getStateForPlacement
 * @javaSource MangrovePropaguleBlock.getStateForPlacement
 * @javaVerified vectors
 */
const RULES = {
    AnvilBlock: horizontalFacing(clockwise),
    BarrelBlock: nearestFacing(opposite),
    BeehiveBlock: horizontalFacing(opposite),
    BellBlock: bell,
    BigDripleafBlock: bigDripleaf,
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
    LeavesBlock: leaves,
    LecternBlock: horizontalFacing(opposite),
    LightningRodBlock: (input, java) => withProperties(java, { facing: input.face }),
    AmethystClusterBlock: (input, java) => withProperties(java, { facing: input.face }),
    LoomBlock: horizontalFacing(opposite),
    ObserverBlock: nearestFacing((face) => face),
    BannerBlock: standingOnGround,
    FlowerBedBlock: segmented,
    LeafLitterBlock: segmented,
    ShelfBlock: (input, java) =>
        withProperties(java, { facing: opposite(horizontalDirection(input.yaw)), powered: String(powered(input)) }),
    ShelfMushroomBlock: firstWall(opposite, onSturdyWall),
    SkullBlock: skull,
    SmallDripleafBlock: smallDripleaf,
    StandingSignBlock: standingOnGround,
    StonecutterBlock: horizontalFacing(opposite),
    TripWireHookBlock: firstWall(opposite, onSturdyWall),
    VaultBlock: horizontalFacing(opposite),
    BaseCoralWallFanBlock: firstWall(opposite, onSturdyWall),
    WallBannerBlock: firstWall(opposite, onSolidWall),
    WallHangingSignBlock: wallHangingSign,
    WallSignBlock: firstWall(opposite, onSolidWall),
    WallSkullBlock: wallSkull,
    AbstractBedBlock: bed,
    BaseCoralPlantTypeBlock: coralPlant,
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
 * @javaVerified vectors
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
 * The Java state a player's placement puts a Java block in, before it is mapped to Bedrock: the
 * block's own rule, or for a standing-and-wall item the standing or wall block it picks.
 *
 * @returns The state, null when Java would refuse the placement, or undefined for a block whose
 *   placement no rule here decides.
 */
export const placedJavaStateOf = (java: JavaState, input: PlacementInput): JavaState | null | undefined => {
    const wallId = wallBlockOf(java.name);
    return wallId !== undefined && placementRuleOf(wallId) !== undefined
        ? standingOrWall(input, java, wallId)
        : runRule(input, java);
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
    const placed = placedJavaStateOf(java, input);
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
