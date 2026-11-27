/**
 * The port's placement states against the ones Java's own `getStateForPlacement` returns, over
 * the grid `utils/oracle/DumpPlacementVectors.java` records from the pinned server jar in
 * `26.3/placement.json`. `src/rules/javaPlacement.vectors.test.ts` and the parity suite's
 * `placement-vectors` row both compare through here.
 *
 * Each placement is rebuilt from its index: the clicked face, where on it the click landed, the
 * look, the neighbors, whether the position holds water, and whether the placer sneaks. The
 * neighbors go into a voxel world as the Bedrock blocks they map to, answering what the port asks
 * of them, how a piston treats them, whether they are full cubes and whether their tops are
 * sturdy, from Java's own answers. The placement runs and the Bedrock block it puts down is
 * compared with the one Java's answer maps to. Comparing in Bedrock's palette is what the server
 * writes, and it leaves out `waterlogged`, which Bedrock keeps in the position's second layer
 * rather than in the block's state.
 *
 * Java's answer is the item's: the state `getStateForPlacement` returns, kept only when the block
 * survives there, and for a sign, banner, head or coral fan item the standing or wall block it
 * picks. A block whose state survives only on the right ground, such as a flower bed, is refused
 * by the block's own survival check rather than by its placement rule, which the families do in
 * their placement guard; for those the port may answer with the state Java's rule returned.
 */
import type { BlockFace, BlockPosition, BlockStateValue, FaceLocation, HookBlock } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';

import type { BlockFamily } from '../src/family';
import { containerFamily, pairedPosition } from '../src/families/containers';
import { lanternFamily } from '../src/families/furniture';
import { dripstoneFamily } from '../src/families/ground';
import { trapdoorFamily } from '../src/families/openable';
import { offset, opposite } from '../src/geometry';
import { bindFamily } from '../src/harness';
import { placedJavaStateOf, placedStateOf } from '../src/rules/javaPlacement';
import type { VoxelDimension } from '../src/voxelWorld';
import { createVoxelWorld } from '../src/voxelWorld';
import vectors from './26.3/placement.json' with { type: 'json' };

/** The recorded vectors. */
export const placementVectors = vectors;

/** The blocks that answer every placement alike, with Java's answers. */
export type PlacementGroup = (typeof vectors.blocks)[number];

/** One block of a group: its Java id, and its wall block's for a standing-and-wall item. */
export type PlacementMember = PlacementGroup['blocks'][number];

/** Which blocks stand around the position and in it. */
export type PlacementLayout = (typeof vectors.layouts)[number];

/** What a placement puts down in Bedrock's palette, or null for one refused. */
export type Placed = { readonly identifier: string; readonly states: Readonly<Record<string, BlockStateValue>> } | null;

/** One recorded placement, rebuilt from its index into the grid. */
export interface Placement {
    readonly face: BlockFace;
    readonly click: number;
    readonly yaw: number;
    readonly pitch: number;
    readonly layout: PlacementLayout;
    readonly water: boolean;
    readonly sneaking: boolean;
}

/** A placement where the port puts down something Java's item would not. */
export interface PlacementMismatch {
    readonly member: PlacementMember;
    readonly placement: Placement;
    /** What Java's item puts down, spelled by {@link spellPlaced}. */
    readonly java: string;
    /** What the port puts down, spelled the same way. */
    readonly port: string;
}

/** What Java says about a neighbor, recorded by the dumper. */
interface Facts {
    readonly pushReaction: string;
    readonly fullCube: boolean;
    readonly sturdyTop: boolean;
}

const FACES: readonly BlockFace[] = ['down', 'up', 'north', 'south', 'west', 'east'];
const at: BlockPosition = { x: vectors.position[0] ?? 0, y: vectors.position[1] ?? 0, z: vectors.position[2] ?? 0 };
const facts: Readonly<Record<string, Facts>> = vectors.facts;
const named: Readonly<Record<string, string>> = vectors.named;

/** Java's push reaction names as `jsprismarine:block_properties` spells them. */
const PUSH_REACTIONS = { push_pull: 'push_pull', push: 'push', popped: 'popped', immoveable: 'immovable' } as const;

const isPushReaction = (name: string): name is keyof typeof PUSH_REACTIONS => name in PUSH_REACTIONS;

/** How many placements the grid holds for each block. */
export const placementCount =
    vectors.faces.length * vectors.clicks.length * vectors.looks.length * vectors.layouts.length * 4;

/** The placement at an index, in the dumper's loop order: face, click, look, layout, water, sneaking. */
export const placementAt = (index: number): Placement => {
    let rest = index;
    const take = (size: number): number => {
        const value = rest % size;
        rest = Math.floor(rest / size);
        return value;
    };
    const sneaking = take(2) === 1;
    const water = take(2) === 1;
    const layout = vectors.layouts[take(vectors.layouts.length)];
    const look = vectors.looks[take(vectors.looks.length)];
    const click = vectors.clicks[take(vectors.clicks.length)];
    const faceName = vectors.faces[take(vectors.faces.length)];
    const face = FACES.find((name) => name === faceName);
    if (layout === undefined || look === undefined || click === undefined || face === undefined) {
        throw new RangeError(`placement ${index} is outside the grid`);
    }
    return { face, click, yaw: look[0] ?? 0, pitch: look[1] ?? 0, layout, water, sneaking };
};

/** A group's state spelled for one member: `$` is the member's id and `$wall` its wall block's. */
const forMember = (state: string, member: PlacementMember): string => {
    if (state.startsWith('$wall')) return `${'wall' in member ? member.wall : ''}${state.slice('$wall'.length)}`;
    if (state.startsWith('$')) return `${member.block}${state.slice(1)}`;
    return state;
};

/** `minecraft:ladder[facing=north,waterlogged=false]` as its id and properties. */
const parseJavaState = (state: string): { readonly name: string; readonly properties: Record<string, string> } => {
    const open = state.indexOf('[');
    if (open < 0) return { name: state, properties: {} };
    const properties: Record<string, string> = {};
    for (const pair of state.slice(open + 1, -1).split(',')) {
        const [key = '', value = ''] = pair.split('=');
        properties[key] = value;
    }
    return { name: state.slice(0, open), properties };
};

/** The Bedrock block a Java state maps to. */
const bedrockOf = (state: string): NonNullable<Placed> => {
    const java = parseJavaState(state);
    const mapped = javaBlockStateToBedrock(java.name, java.properties);
    if (mapped.kind !== 'mapped' && mapped.kind !== 'loss') throw new RangeError(`${state} maps to no Bedrock block`);
    return { identifier: mapped.bedrock.name, states: { ...mapped.bedrock.states } };
};

/** The Java state a layout's name stands for, with the member's own block for `self`. */
const layoutState = (
    group: PlacementGroup,
    member: PlacementMember,
    name: string,
    face: BlockFace
): string | undefined => {
    if (name === 'air') return undefined;
    if (name === 'self') return forMember(group.default, member);
    if (name === 'self-facing') return forMember(group.facing[FACES.indexOf(face)] ?? group.default, member);
    return named[name] ?? name;
};

const keyOf = (position: BlockPosition): string => `${position.x},${position.y},${position.z}`;

/**
 * Fills a dimension with a placement's neighbors and what stands at the position, as the dumper
 * does, and teaches it Java's facts about each: its push reaction through the block properties,
 * and its full cube and sturdy top through the two questions a voxel world cannot answer itself.
 */
const fillLayout = (
    dimension: VoxelDimension,
    group: PlacementGroup,
    member: PlacementMember,
    placement: Placement
): void => {
    const { layout, face, water } = placement;
    const known = new Map<string, Facts>();
    const put = (position: BlockPosition, state: string): void => {
        const block = bedrockOf(state);
        dimension.set(position, block.identifier, block.states);
        const fact = facts[state];
        if (fact === undefined || !isPushReaction(fact.pushReaction)) {
            throw new RangeError(`the vectors record no facts for ${state}`);
        }
        known.set(keyOf(position), fact);
        dimension.defineProperties(block.identifier, { pushReaction: PUSH_REACTIONS[fact.pushReaction] });
    };
    const replacing = layout.at !== 'air';
    for (const side of FACES) {
        const name = !replacing && side === opposite(face) ? layout.clicked : layout.around;
        const state = layoutState(group, member, name, face);
        if (state !== undefined) put(offset(at, side), state);
    }
    let here = layoutState(group, member, layout.at, face);
    if (water) {
        if (here === undefined) here = named['water'];
        else if (layout.at === 'short_grass') here = named['seagrass'];
        else if (layout.at === 'self') here = forMember(group.waterlogged, member);
    }
    if (here !== undefined) put(at, here);
    const factOf = (block: HookBlock): Facts | undefined => known.get(keyOf(block.position));
    Object.assign(dimension, {
        isFullCube: (block: HookBlock) => factOf(block)?.fullCube ?? false,
        hasSturdyTopFace: (block: HookBlock) => factOf(block)?.sturdyTop ?? false
    });
    // A redstone block powers the blocks beside it, which the server's world reports and a voxel
    // world only reports when told.
    const powered = FACES.some((side) => dimension.block(offset(at, side)).identifier === 'minecraft:redstone_block');
    if (powered) dimension.setPower(at, 15);
};

/** Where on the clicked block's face the click landed, as Bedrock reports it, each part in [0, 1]. */
const faceLocationOf = (placement: Placement): FaceLocation => {
    const { face, click } = placement;
    const normal = offset({ x: 0, y: 0, z: 0 }, face);
    const vertical = face === 'up' || face === 'down';
    return {
        x: 0.5 + normal.x * 0.5 + (vertical ? click : 0),
        y: 0.5 + normal.y * 0.5 + (vertical ? 0 : click),
        z: 0.5 + normal.z * 0.5 + (vertical ? click : 0)
    };
};

/** The rules `javaPlacement.ts` holds, run the way the server's interaction path runs them. */
const placeByRule = (group: PlacementGroup, member: PlacementMember, placement: Placement): Placed | undefined => {
    const world = createVoxelWorld().overworld;
    fillLayout(world, group, member, placement);
    const held = bedrockOf(forMember(group.default, member));
    return placedStateOf(held.identifier, held.states, {
        world,
        position: at,
        face: placement.face,
        yaw: placement.yaw,
        pitch: placement.pitch,
        sneaking: placement.sneaking,
        replacingClicked: placement.layout.at !== 'air'
    });
};

/**
 * The Java state a rule picks, started from Java's own default state rather than one read back
 * from Bedrock, for the properties Bedrock keeps elsewhere or drops, such as a head's rotation.
 * `waterlogged` is left out: Bedrock keeps water in the position's second layer, and no rule
 * here decides it.
 */
const javaStateByRule = (group: PlacementGroup, member: PlacementMember, placement: Placement): string => {
    const world = createVoxelWorld().overworld;
    fillLayout(world, group, member, placement);
    const placed = placedJavaStateOf(parseJavaState(forMember(group.default, member)), {
        world,
        position: at,
        face: placement.face,
        yaw: placement.yaw,
        pitch: placement.pitch,
        sneaking: placement.sneaking,
        replacingClicked: placement.layout.at !== 'air'
    });
    return placed === undefined ? 'no rule' : placed === null ? 'refused' : spellJava(placed.name, placed.properties);
};

/** A Java state as text without `waterlogged`, with its properties in name order. */
const spellJava = (name: string, properties: Readonly<Record<string, string>>): string => {
    const kept = Object.entries(properties)
        .filter(([property]) => property !== 'waterlogged')
        .sort(([a], [b]) => a.localeCompare(b));
    return `${name}[${kept.map(([property, value]) => `${property}=${value}`).join(',')}]`;
};

/** The families whose own placement hooks copy a `getStateForPlacement`, by the Java class. */
const FAMILIES: Readonly<Record<string, BlockFamily>> = {
    ChestBlock: containerFamily,
    LanternBlock: lanternFamily,
    SpeleothemBlock: dripstoneFamily,
    TrapDoorBlock: trapdoorFamily
};

/** A family's placement guard and `onPlace`, run over the block in its default state. */
const placeByFamily = (
    family: BlockFamily,
    group: PlacementGroup,
    member: PlacementMember,
    placement: Placement
): Placed => {
    const start = bedrockOf(forMember(group.default, member));
    const harness = bindFamily(family, start.identifier);
    fillLayout(harness.dimension, group, member, placement);
    harness.dimension.set(at, start.identifier, start.states);
    const placedBy = {
        identifier: 'minecraft:player',
        position: { x: at.x + 0.5, y: at.y + 2, z: at.z + 0.5 },
        yaw: placement.yaw,
        pitch: placement.pitch
    };
    if (harness.beforePlace(at, placement.face, placedBy)) return null;
    harness.place(at, {
        placedBy,
        face: placement.face,
        faceLocation: faceLocationOf(placement),
        sneaking: placement.sneaking
    });
    const block = harness.dimension.block(at);
    if (group.class !== 'ChestBlock') return { identifier: block.identifier, states: { ...block.states } };
    // A chest's pairing is block entity data in Bedrock rather than a state, so it is compared
    // as the side its partner is on.
    const partner = pairedPosition(harness.dimension.getBlockData(at));
    const side = partner === undefined ? undefined : FACES.find((face) => keyOf(offset(at, face)) === keyOf(partner));
    return { identifier: block.identifier, states: { ...block.states, [PAIRED]: side ?? 'none' } };
};

/** The pseudo-state a chest's pairing is compared as. */
const PAIRED = 'paired';

const CLOCKWISE: Readonly<Record<string, BlockFace>> = { north: 'east', east: 'south', south: 'west', west: 'north' };

/**
 * The Bedrock block a Java state maps to, and for a chest the side its partner is on, Java's
 * `ChestBlock.getConnectedDirection`: clockwise from its facing for the left half.
 */
const expectedOf = (group: PlacementGroup, state: string): NonNullable<Placed> => {
    const bedrock = bedrockOf(state);
    if (group.class !== 'ChestBlock') return bedrock;
    const { properties } = parseJavaState(state);
    const clockwise = CLOCKWISE[properties['facing'] ?? ''];
    const type = properties['type'];
    const side =
        clockwise === undefined
            ? undefined
            : type === 'left'
              ? clockwise
              : type === 'right'
                ? opposite(clockwise)
                : undefined;
    return { ...bedrock, states: { ...bedrock.states, [PAIRED]: side ?? 'none' } };
};

/** One palette entry of a group, for one member, by the character the grid spells it with. */
const paletteEntry = (group: PlacementGroup, member: PlacementMember, spelled: string | undefined): string | null => {
    const entry = group.palette[vectors.alphabet.indexOf(spelled ?? '')];
    if (entry === undefined) throw new RangeError(`${group.class} spells a state outside its palette`);
    return entry === null ? null : forMember(entry, member);
};

/**
 * A placement's result as text, with its states in name order and booleans as Bedrock's bytes, so
 * a family's `true` and the mapping's `1` compare equal.
 */
export const spellPlaced = (placed: Placed | undefined): string => {
    if (placed === undefined) return 'no rule';
    if (placed === null) return 'refused';
    const states = Object.entries(placed.states)
        .map(([name, value]) => [name, typeof value === 'boolean' ? Number(value) : value] as const)
        .sort(([a], [b]) => a.localeCompare(b));
    return `${placed.identifier} ${JSON.stringify(Object.fromEntries(states))}`;
};

/** A placement in words, for a failure message. */
export const describePlacement = (placement: Placement): string =>
    `${placement.face} face, click ${placement.click}, yaw ${placement.yaw}, pitch ${placement.pitch}, ` +
    `${placement.layout.clicked} clicked, ${placement.layout.around} around, ${placement.layout.at} in place` +
    `${placement.water ? ', in water' : ''}${placement.sneaking ? ', sneaking' : ''}`;

/** Every placement of one member where the port puts down something Java's item would not. */
export const placementMismatches = (group: PlacementGroup, member: PlacementMember): PlacementMismatch[] => {
    const family = FAMILIES[group.class];
    const mismatches: PlacementMismatch[] = [];
    for (let index = 0; index < placementCount; index++) {
        const placed = paletteEntry(group, member, group.placed[index]);
        // The layout's block at the position would not be replaced, so Java's click goes beside
        // it and the placement is not the one recorded.
        if (placed === '~') continue;
        const state = paletteEntry(group, member, group.state[index]);
        const placement = placementAt(index);
        const port =
            family === undefined
                ? placeByRule(group, member, placement)
                : placeByFamily(family, group, member, placement);
        const java = spellPlaced(placed === null ? null : expectedOf(group, placed));
        if (spellPlaced(port) === java) {
            if (family !== undefined || placed === null) continue;
            const expected = parseJavaState(placed);
            const javaLevel = javaStateByRule(group, member, placement);
            if (javaLevel === spellJava(expected.name, expected.properties)) continue;
            mismatches.push({ member, placement, java: placed, port: javaLevel });
            continue;
        }
        // Refused only because the state cannot survive here, which the block's survival check
        // decides rather than its placement rule.
        const survivalOnly = placed === null && state !== null && !('wall' in member);
        if (survivalOnly && spellPlaced(port) === spellPlaced(expectedOf(group, state))) continue;
        mismatches.push({ member, placement, java, port: spellPlaced(port) });
    }
    return mismatches;
};

/**
 * A difference from Java the vectors show and an issue tracks. A placement it covers may differ;
 * every class it names has to differ somewhere, so a fix fails the unit test until the entry goes.
 */
export interface PlacementGap {
    readonly issue: string;
    /** Why the port differs, in one sentence. */
    readonly reason: string;
    readonly classes: readonly string[];
    readonly covers: (placement: Placement) => boolean;
}

/** Whether a placement's support is a block of the kind being placed. */
const supportedByItsOwnKind = ({ layout }: Placement): boolean =>
    [layout.clicked, layout.around].some((name) => name === 'self' || name === 'self-facing');

/** The differences from Java the vectors show that stay open, each with the issue tracking it. */
export const PLACEMENT_GAPS: readonly PlacementGap[] = [
    {
        issue: 'https://github.com/JSPrismarine/JSPrismarine/issues/3786',
        reason: "The port's support test reads push reaction and full cubes, where Java asks each block's survival rule, so a sign, ladder, bell, lantern, grindstone or coral fan against one of its own kind is placed where Java refuses it or refused where Java places it.",
        classes: [
            'BannerBlock',
            'BaseCoralPlantTypeBlock',
            'BaseCoralWallFanBlock',
            'BellBlock',
            'FaceAttachedHorizontalDirectionalBlock',
            'LadderBlock',
            'LanternBlock',
            'StandingSignBlock'
        ],
        covers: supportedByItsOwnKind
    },
    {
        issue: 'https://github.com/JSPrismarine/JSPrismarine/issues/3787',
        reason: "A family's placement event does not say whether the clicked block was replaced, so a trapdoor or lantern placed into short grass is placed as if against the grass's face.",
        classes: ['LanternBlock', 'TrapDoorBlock'],
        covers: ({ layout }) => layout.at === 'short_grass'
    }
];

/** The open gap a mismatch falls under, or undefined for one no gap explains. */
export const placementGapOf = (group: PlacementGroup, mismatch: PlacementMismatch): PlacementGap | undefined =>
    PLACEMENT_GAPS.find((gap) => gap.classes.includes(group.class) && gap.covers(mismatch.placement));
