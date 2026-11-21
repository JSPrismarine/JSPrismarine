import { VANILLA_BLOCK_FAMILIES, bindFamily, heldItem, isFallingBlock } from '@jsprismarine/block-behaviors';
import type { FamilyHarness } from '@jsprismarine/block-behaviors';
import { createVoxelWorld } from '@jsprismarine/block-behaviors';
import { performPull, performPush, planPush } from '@jsprismarine/block-behaviors/rules/piston';
import { spreadLiquid } from '@jsprismarine/block-behaviors/rules/fluid';
import { isFullCube } from '@jsprismarine/engine-systems';
import { blockProperties } from '@jsprismarine/blocks/components';
import { faceOccludesIn } from '@jsprismarine/blocks/geometry';
import { behaviorFor } from '@jsprismarine/blocks';
import type { BlockFace } from '@jsprismarine/blocks';
import { bedrockBlockEntityDyeIndexOf, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { blocksTable } from '@jsprismarine/mapping/tables';
import { blockLootTableOf } from '@jsprismarine/prismarine/block/blockLoot';
import { DYE_INDEX_FIELD } from '@jsprismarine/prismarine/blockentity/contentRecord';
import { needsSupport } from '@jsprismarine/prismarine/world/physics/BlockRules';
import { isJavaLiquidContainer } from '@jsprismarine/prismarine/content/world/fluidReplacement';
import { expect, it } from 'vitest';

import type { BehaviorAspect, BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { blockPropertyScenarios, javaBlockRows } from './blockScenarios/properties.ts';
import { javaBlockBehaviors, javaBlockIsA } from './javaBlockClasses.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';

/** A Java block with the Bedrock block and default states the server represents it with. */
interface BlockSubject {
    readonly javaId: string;
    readonly bedrock: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
    /** The family Java's own grouping of this block implies, for the scenarios that check it. */
    readonly expectedFamily?: string;
}

const subjectOf = (javaId: string): BlockSubject | undefined => {
    const mapping = javaBlockStateToBedrock(javaId);
    if (mapping.kind !== 'mapped') return undefined;
    return { javaId, bedrock: mapping.bedrock.name, states: mapping.bedrock.states };
};

const tagMembers = (tag: string): readonly BlockSubject[] =>
    serverContent()
        .tags.members('block', tag)
        .flatMap((javaId) => subjectOf(javaId) ?? []);

const bind = (subject: BlockSubject, harnessWorld?: Parameters<typeof bindFamily>[2]): FamilyHarness => {
    const name = behaviorFor(subject.bedrock);
    const family = VANILLA_BLOCK_FAMILIES.find((candidate) => candidate.name === name);
    if (family === undefined) throw new Error(`no family registered as ${name}`);
    return bindFamily(family, subject.bedrock, harnessWorld);
};

const ORIGIN = { x: 0, y: 5, z: 0 } as const;

const named = (...javaIds: readonly string[]): readonly BlockSubject[] =>
    javaIds.flatMap((javaId) => subjectOf(javaId) ?? []);

/** A Java copper block, the Java block one oxidation stage further along, and the server's identity for it. */
interface CopperChain {
    readonly subject: BlockSubject;
    readonly next: BlockSubject;
}

const COPPER_STAGES = ['exposed_', 'weathered_', 'oxidized_'] as const;

/** Java's `WeatheringCopper` pairs, read off the block names: each copper block that has a next stage. */
const weatheringCopper = (): readonly CopperChain[] =>
    Object.keys(blocksTable.blocks).flatMap((javaId) => {
        const bare = javaId.replace('minecraft:', '');
        if (!bare.includes('copper') || bare.startsWith('waxed_') || bare.startsWith('oxidized_')) return [];
        const stage = COPPER_STAGES.findIndex((prefix) => bare.startsWith(prefix));
        const base = stage === -1 ? bare : bare.slice(COPPER_STAGES[stage]?.length ?? 0);
        // `copper_block` is the only name whose unoxidized form is not the shape itself.
        const shape = base === 'copper_block' ? 'copper' : base;
        const nextShape = stage === -1 && base === 'copper_block' ? 'copper' : shape;
        const next = subjectOf(`minecraft:${COPPER_STAGES[stage + 1]}${nextShape}`);
        const subject = subjectOf(javaId);
        return subject === undefined || next === undefined ? [] : [{ subject, next }];
    });

const BELOW = { x: 0, y: 4, z: 0 } as const;

/** How far the stone floor reaches: past water's slope search, so no edge offers a shorter way down. */
const FLOOR_REACH = 6;

/**
 * A world whose full cubes are the ones the server's engine answers for, so a slab is not walled
 * in by the test double's own fallback, and whose floor is stone.
 */
const fluidWorld = () => {
    const world = createVoxelWorld().overworld;
    for (let x = -FLOOR_REACH; x <= FLOOR_REACH; x++) {
        for (let z = -FLOOR_REACH; z <= FLOOR_REACH; z++) world.set({ x, y: BELOW.y, z }, 'minecraft:stone');
    }
    type Block = { identifier: string; states: Readonly<Record<string, string | number | boolean>> };
    return Object.assign(world, {
        isFullCube: (block: Block) => isFullCube({ name: block.identifier, states: block.states }),
        // The server's own answer, from the captured collision shapes.
        faceOccludes: (block: Block, neighbor: Block, face: BlockFace) =>
            faceOccludesIn(serverContent().blocks.types, block, neighbor, face),
        // The server's Java fluid rule, which the server follows by default.
        holdsWater: (block: Block) => isJavaLiquidContainer(block)
    });
};

/**
 * Java's four `GrowingPlantHeadBlock`s: the way each grows, what into, its Bedrock age state, and
 * any Bedrock head besides its own a new head may be (a cave vine head with berries).
 */
const GROWING_PLANT_HEADS: Readonly<
    Record<
        string,
        {
            readonly direction: 'up' | 'down';
            readonly into: 'air' | 'water';
            readonly ageState: string;
            readonly alsoGrows?: string;
        }
    >
> = {
    'minecraft:cave_vines': {
        direction: 'down',
        into: 'air',
        ageState: 'growing_plant_age',
        alsoGrows: 'minecraft:cave_vines_head_with_berries'
    },
    'minecraft:kelp': { direction: 'up', into: 'water', ageState: 'kelp_age' },
    'minecraft:twisting_vines': { direction: 'up', into: 'air', ageState: 'twisting_vines_age' },
    'minecraft:weeping_vines': { direction: 'down', into: 'air', ageState: 'weeping_vines_age' }
};

/** The server family each Java behavior tag maps to; a block in the tag running another family is misfiled. */
const FAMILY_BY_TAG: readonly (readonly [string, string])[] = [
    ['minecraft:doors', 'jsprismarine:door'],
    ['minecraft:trapdoors', 'jsprismarine:trapdoor'],
    ['minecraft:fence_gates', 'jsprismarine:fence_gate'],
    ['minecraft:buttons', 'jsprismarine:button'],
    ['minecraft:pressure_plates', 'jsprismarine:pressure_plate'],
    ['minecraft:slabs', 'jsprismarine:slab'],
    ['minecraft:stairs', 'jsprismarine:stairs'],
    ['minecraft:walls', 'jsprismarine:wall'],
    ['minecraft:leaves', 'jsprismarine:leaves'],
    ['minecraft:saplings', 'jsprismarine:sapling'],
    ['minecraft:crops', 'jsprismarine:crop'],
    ['minecraft:small_flowers', 'jsprismarine:flora'],
    ['minecraft:beds', 'jsprismarine:bed'],
    ['minecraft:candles', 'jsprismarine:candle'],
    ['minecraft:banners', 'jsprismarine:banner'],
    ['minecraft:all_signs', 'jsprismarine:sign'],
    ['minecraft:rails', 'jsprismarine:rail'],
    ['minecraft:shulker_boxes', 'jsprismarine:container'],
    ['minecraft:cauldrons', 'jsprismarine:cauldron'],
    ['minecraft:flower_pots', 'jsprismarine:flower_pot'],
    ['minecraft:logs', 'jsprismarine:log']
];

/**
 * The Java block classes whose `canSurvive` asks only that nothing solid sits on top, so they
 * stay with nothing around them: farmland and a dirt path.
 */
const SURVIVES_IN_AIR: readonly string[] = ['FarmlandBlock', 'PathBlock'];

/** A state value as the palette holds it, where a boolean is 0 or 1. */
const paletteValue = (value: string | number | boolean | undefined): string | number | undefined =>
    typeof value === 'boolean' ? Number(value) : value;

/** Minecraft yaws for a placer looking each horizontal way: 0 is south and 90 is west. */
const LOOKING: readonly (readonly [facing: string, yaw: number])[] = [
    ['south', 0],
    ['west', 90],
    ['north', 180],
    ['east', 270]
];

/** The clicks a placement scenario tries: each face, and a side low, at the middle and high. */
const CLICKS: readonly (readonly [face: BlockFace, y: number])[] = [
    ['up', 0.5],
    ['down', 0.5],
    ['north', 0.25],
    ['north', 0.5],
    ['north', 0.75]
];

/**
 * Places a block for every look direction and click, and compares each placed state with the
 * Bedrock state Java's state maps to, on the states Java's placement decides.
 */
const placementDifference = (
    subject: BlockSubject,
    java: (facing: string, face: BlockFace, y: number) => Readonly<Record<string, string>>
): string | undefined => {
    for (const [facing, yaw] of LOOKING) {
        for (const [face, y] of CLICKS) {
            const properties = { ...java(facing, face, y), waterlogged: 'false' };
            const mapped = javaBlockStateToBedrock(subject.javaId, properties);
            if (mapped.kind !== 'mapped') return `Java's ${JSON.stringify(properties)} maps to no Bedrock state`;
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.place(ORIGIN, {
                face,
                faceLocation: { x: 0.5, y, z: 0.5 },
                placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 5, z: 0 }, yaw }
            });
            const placed = harness.block(ORIGIN).states;
            const differs = Object.entries(mapped.bedrock.states).find(
                ([name, value]) => paletteValue(placed[name]) !== paletteValue(value)
            );
            if (differs !== undefined) {
                return `looking ${facing} and clicking ${face} at ${y}, its ${differs[0]} is ${String(placed[differs[0]])}, Java's is ${String(differs[1])}`;
            }
        }
    }
    return undefined;
};

const blockScenarios: readonly BehaviorScenario<BlockSubject>[] = [
    {
        name: 'family-matches-java-group',
        java: 'Every block in a Java behavior tag (doors, crops, saplings, small flowers, and so on) runs the matching server behavior family.',
        reference:
            'Java block tags under data/minecraft/tags/block, which group blocks by the class that implements them',
        subjects: () =>
            FAMILY_BY_TAG.flatMap(([tag, family]) =>
                tagMembers(tag)
                    // Azaleas sit in Java's sapling tag but only grow with bone meal, which flora handles.
                    .filter((subject) => !subject.javaId.endsWith('azalea'))
                    .map((subject) => ({ ...subject, expectedFamily: family }))
            ),
        idOf: (subject) => subject.javaId,
        // Which family a block runs is not its behavior, so a right answer evidences nothing.
        guard: true,
        covers: () => undefined,
        run: (subject) => {
            const actual = behaviorFor(subject.bedrock);
            return actual === subject.expectedFamily
                ? undefined
                : `it runs ${actual}, Java's grouping implies ${subject.expectedFamily}`;
        }
    },
    {
        name: 'hand-toggle',
        java: 'A door, trapdoor or fence gate opens and closes when a player uses it with an empty hand; iron doors and trapdoors need redstone.',
        reference: 'Java DoorBlock, TrapDoorBlock and FenceGateBlock useWithoutItem',
        subjects: () => [
            ...tagMembers('minecraft:doors'),
            ...tagMembers('minecraft:trapdoors'),
            ...tagMembers('minecraft:fence_gates')
        ],
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            const handled = harness.interact(ORIGIN);
            const open = harness.dimension.stateAt(ORIGIN, 'open_bit') === true;
            const byHand = subject.javaId !== 'minecraft:iron_door' && subject.javaId !== 'minecraft:iron_trapdoor';
            if (byHand && !open) return `a bare hand did not open it (interact returned ${String(handled)})`;
            if (!byHand && open) return 'a bare hand opened an iron block';
            return undefined;
        }
    },
    {
        name: 'button-pulse',
        java: 'A button powers for 30 ticks (wood) or 20 ticks (stone) after a press, then releases.',
        reference: 'Java ButtonBlock ticksToStayPressed',
        subjects: () => tagMembers('minecraft:buttons'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.interact(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'button_pressed_bit') !== true) return 'pressing it did not power it';
            const wanted = subject.javaId.includes('stone') || subject.javaId.includes('blackstone') ? 20 : 30;
            const tick = harness.dimension.scheduled.at(-1);
            if (tick?.delay !== wanted)
                return `it scheduled its release after ${tick?.delay} ticks, Java uses ${wanted}`;
            harness.tick(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'button_pressed_bit') === true)
                return 'it stayed powered after its release tick';
            return undefined;
        }
    },
    {
        name: 'pressure-plate-trigger',
        java: 'A pressure plate powers while an entity stands on it and releases once it is empty.',
        reference: 'Java BasePressurePlateBlock entityInside and tick',
        subjects: () => tagMembers('minecraft:pressure_plates'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:stone');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.addEntity('minecraft:player', ORIGIN);
            harness.stepOn(ORIGIN);
            const powered = harness.dimension.stateAt(ORIGIN, 'redstone_signal');
            if (typeof powered !== 'number' || powered === 0) return 'an entity standing on it did not power it';
            for (const entity of harness.dimension.entities) harness.dimension.removeEntity(entity.id);
            harness.tick(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'redstone_signal') !== 0)
                return 'it stayed powered with nothing on it';
            return undefined;
        }
    },
    {
        name: 'plant-needs-ground',
        java: 'A flower or sapling breaks and drops when the block it grows on is removed.',
        reference: 'Java BushBlock updateShape and canSurvive',
        subjects: () => [...tagMembers('minecraft:small_flowers'), ...tagMembers('minecraft:saplings')],
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:grass_block');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.set(BELOW, 'minecraft:air');
            harness.neighborChanged(ORIGIN, 'down');
            if (harness.dimension.identifierAt(ORIGIN) !== 'minecraft:air')
                return 'it stayed in the air after its ground was removed';
            if (harness.dimension.drops.length === 0) return 'it broke without dropping an item';
            return undefined;
        }
    },
    {
        name: 'mushroom-needs-dark-or-mycelium',
        java: 'A small mushroom stays on stone in light below 13, breaks on stone in brighter light, and stays on mycelium in any light.',
        reference: 'Java MushroomBlock canSurvive and BushBlock updateShape',
        subjects: () => named('minecraft:brown_mushroom', 'minecraft:red_mushroom'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:stone');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.setLight(ORIGIN, 12);
            harness.neighborChanged(ORIGIN, 'down');
            if (harness.dimension.identifierAt(ORIGIN) !== subject.bedrock) return 'it broke on stone in the dark';

            harness.dimension.set(BELOW, 'minecraft:mycelium');
            harness.dimension.setLight(ORIGIN, 15);
            harness.neighborChanged(ORIGIN, 'down');
            if (harness.dimension.identifierAt(ORIGIN) !== subject.bedrock) return 'it broke on mycelium in daylight';

            harness.dimension.set(BELOW, 'minecraft:stone');
            harness.neighborChanged(ORIGIN, 'down');
            if (harness.dimension.identifierAt(ORIGIN) !== 'minecraft:air') return 'it stayed on stone in daylight';
            return undefined;
        }
    },
    {
        name: 'door-needs-ground',
        java: 'A door breaks and drops when the block below its lower half is removed.',
        reference: 'Java DoorBlock updateShape and canSurvive',
        subjects: () => tagMembers('minecraft:doors'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:stone');
            harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, upper_block_bit: false });
            harness.dimension.set({ ...ORIGIN, y: 6 }, subject.bedrock, { ...subject.states, upper_block_bit: true });
            harness.dimension.set(BELOW, 'minecraft:air');
            harness.neighborChanged(ORIGIN, 'down');
            if (harness.dimension.identifierAt(ORIGIN) !== 'minecraft:air') return 'its lower half stayed in the air';
            return undefined;
        }
    },
    {
        name: 'falls-without-support',
        java: 'Sand, gravel, concrete powder, anvils and the dragon egg fall when nothing holds them up.',
        reference: 'Java FallingBlock, ConcretePowderBlock, AnvilBlock and DragonEggBlock',
        subjects: () => [
            ...named(
                'minecraft:sand',
                'minecraft:red_sand',
                'minecraft:gravel',
                'minecraft:dragon_egg',
                'minecraft:suspicious_sand',
                'minecraft:suspicious_gravel'
            ),
            ...tagMembers('minecraft:concrete_powders'),
            ...tagMembers('minecraft:anvil')
        ],
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.neighborChanged(ORIGIN, 'down');
            harness.tick(ORIGIN);
            const moved = harness.dimension.identifierAt(ORIGIN) !== subject.bedrock;
            // The engine's BlockPhysics also drops any block `falls` names, whatever its family does.
            if (!moved && harness.dimension.entities.length === 0 && !isFallingBlock(subject.bedrock))
                return 'it stayed in the air';
            return undefined;
        }
    },
    {
        name: 'crop-growth',
        java: 'A crop on moist farmland advances its growth stage on random ticks.',
        reference: 'Java CropBlock randomTick',
        subjects: () =>
            named(
                'minecraft:wheat',
                'minecraft:carrots',
                'minecraft:potatoes',
                'minecraft:beetroots',
                'minecraft:torchflower_crop'
            ),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:farmland', { moisturized_amount: 7 });
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.setLight(ORIGIN, 15);
            harness.dimension.queueRandom(...Array.from({ length: 64 }, () => 0));
            const before = JSON.stringify(harness.block(ORIGIN).states);
            harness.randomTicks(ORIGIN, 32);
            if (JSON.stringify(harness.block(ORIGIN).states) === before) return 'its growth stage never advanced';
            return undefined;
        }
    },
    {
        name: 'waterlogged-by-two-sources',
        java: 'A waterloggable block between two water sources over solid ground takes the source water its spread makes there, as LiquidBlockContainer.placeLiquid does.',
        reference:
            'Java FlowingFluid.spreadTo and getNewLiquid, SimpleWaterloggedBlock.canPlaceLiquid and placeLiquid; issue #3093',
        subjects: () => named('minecraft:stone_slab'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const world = fluidWorld();
            const west = { ...ORIGIN, x: ORIGIN.x - 1 };
            const east = { ...ORIGIN, x: ORIGIN.x + 1 };
            world.set(ORIGIN, subject.bedrock, subject.states);
            world.set(west, 'minecraft:water', { liquid_depth: 0 });
            world.set(east, 'minecraft:water', { liquid_depth: 0 });
            spreadLiquid(world, world.block(west));
            if (world.getLiquid(ORIGIN)?.identifier !== 'minecraft:water') {
                return 'the block between two sources was not waterlogged';
            }
            return undefined;
        },
        classify: () => ({
            kind: 'defect',
            reason: 'Flowing water never enters a waterloggable block here, and nothing writes the liquid layer at runtime, so a spread cannot waterlog one.'
        })
    },
    {
        name: 'bottom-slab-holds-water',
        java: "A waterlogged bottom slab's full bottom face keeps its water from flowing down into the air below.",
        reference: 'Java FlowingFluid.canPassThroughWall over the block shapes; issue #3093',
        subjects: () => named('minecraft:stone_slab'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const world = fluidWorld();
            const below = { ...ORIGIN, y: ORIGIN.y - 1 };
            world.set(below, 'minecraft:air');
            world.set(ORIGIN, subject.bedrock, subject.states);
            world.setLiquid(ORIGIN, 'minecraft:water');
            spreadLiquid(world, { ...world.block(ORIGIN), identifier: 'minecraft:water', states: {} });
            if (world.identifierAt(below) !== 'minecraft:air')
                return 'its water flowed down through the full bottom face';
            return undefined;
        },
        classify: () => ({
            kind: 'defect',
            reason: 'Fluid rules treat a block as a full cube or as open, so a bottom slab lets its water out of its full bottom face.'
        })
    },
    {
        name: 'grass-spread',
        java: 'A grass or mycelium block in light 9 or more makes four attempts at a random block within one across, three below and one above, and spreads onto dirt there.',
        reference: 'Java SpreadingSnowyBlock randomTick and canPropagate; issue #3092',
        subjects: () => named('minecraft:grass_block', 'minecraft:mycelium'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            const target = { x: ORIGIN.x + 1, y: ORIGIN.y - 1, z: ORIGIN.z + 1 };
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.set(target, 'minecraft:dirt');
            harness.dimension.setLight({ ...ORIGIN, y: ORIGIN.y + 1 }, 15);
            harness.dimension.setLight({ ...target, y: target.y + 1 }, 15);
            // Java's three nextInt draws of an attempt: 0.9 gives +1 across, 0.5 gives -1 down.
            harness.dimension.queueRandom(...Array.from({ length: 4 }, () => [0.9, 0.5, 0.9]).flat());
            harness.randomTick(ORIGIN);
            if (harness.dimension.identifierAt(target) !== subject.bedrock) {
                return 'it did not spread onto the dirt one across and one below';
            }
            return undefined;
        }
    },
    {
        name: 'growing-plant-head',
        java: 'A growing plant head younger than 25 grows one block in its direction on a random tick, into the block its plant grows into, and its body does not grow.',
        reference:
            'Java GrowingPlantHeadBlock randomTick and its CaveVinesBlock, KelpBlock, TwistingVinesBlock and WeepingVinesBlock subclasses; issue #3091',
        subjects: () =>
            named('minecraft:cave_vines', 'minecraft:kelp', 'minecraft:twisting_vines', 'minecraft:weeping_vines'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const grows = GROWING_PLANT_HEADS[subject.javaId];
            if (grows === undefined) return 'no growth direction is recorded for this head';
            const harness = bind(subject);
            const target = { ...ORIGIN, y: ORIGIN.y + (grows.direction === 'up' ? 1 : -1) };
            if (grows.into === 'water') harness.dimension.set(target, 'minecraft:water', { liquid_depth: 0 });
            harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, [grows.ageState]: 0 });
            // Every draw passes Java's growPerTickProbability, and a cave vine's berry chance too.
            harness.dimension.queueRandom(...Array.from({ length: 8 }, () => 0.05));
            harness.randomTick(ORIGIN);
            const grown = harness.dimension.identifierAt(target);
            if (grown === 'minecraft:air' || grown === 'minecraft:water')
                return 'the head did not grow on a random tick';
            if (grown !== subject.bedrock && grown !== grows.alsoGrows)
                return `the head grew ${grown} rather than more of itself`;
            if (harness.block(target).states[grows.ageState] !== 1) return 'the grown head is not one year older';
            return undefined;
        }
    },
    {
        name: 'leaves-decay',
        java: 'Leaves with no log within six blocks and not placed by a player decay and drop.',
        reference: 'Java LeavesBlock randomTick and decaying',
        subjects: () => tagMembers('minecraft:leaves'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, {
                ...subject.states,
                persistent_bit: false,
                update_bit: true
            });
            harness.dimension.queueRandom(...Array.from({ length: 16 }, () => 0));
            harness.randomTicks(ORIGIN, 4);
            if (harness.dimension.identifierAt(ORIGIN) === subject.bedrock) return 'isolated leaves never decayed';
            return undefined;
        }
    },
    {
        name: 'lamp-follows-power',
        java: 'A redstone lamp lights when powered and goes out when power is removed.',
        reference: 'Java RedstoneLampBlock neighborChanged',
        subjects: () => named('minecraft:redstone_lamp'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.redstone(ORIGIN, 15);
            if (harness.dimension.identifierAt(ORIGIN) !== 'minecraft:lit_redstone_lamp')
                return 'it did not light under power';
            return undefined;
        }
    },
    {
        name: 'concrete-powder-hardens',
        java: 'Concrete powder turns into concrete of the same color when it touches water.',
        reference: 'Java ConcretePowderBlock updateShape and onPlace',
        subjects: () => tagMembers('minecraft:concrete_powders'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:stone');
            harness.dimension.set({ x: 1, y: 5, z: 0 }, 'minecraft:water');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.place(ORIGIN);
            harness.neighborChanged(ORIGIN, 'east');
            const hardened = subject.bedrock.replace('_powder', '');
            if (harness.dimension.identifierAt(ORIGIN) !== hardened) return 'it stayed powder next to water';
            return undefined;
        }
    },
    {
        name: 'tnt-ignites-on-power',
        java: 'TNT becomes a primed TNT entity when it receives a redstone signal.',
        reference: 'Java TntBlock neighborChanged',
        subjects: () => named('minecraft:tnt'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.redstone(ORIGIN, 15);
            if (harness.dimension.identifierAt(ORIGIN) === subject.bedrock) return 'it stayed a block under power';
            if (!harness.dimension.entities.some((entity) => entity.identifier === 'minecraft:tnt'))
                return 'no primed TNT entity appeared';
            return undefined;
        }
    },
    {
        name: 'stalk-grows-upward',
        java: 'Sugar cane and cactus add a block on top on random ticks until three high.',
        reference: 'Java SugarCaneBlock and CactusBlock randomTick',
        subjects: () => named('minecraft:sugar_cane', 'minecraft:cactus'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:sand');
            if (subject.javaId === 'minecraft:sugar_cane')
                harness.dimension.set({ x: 1, y: 4, z: 0 }, 'minecraft:water');
            harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, age: 15 });
            harness.dimension.queueRandom(...Array.from({ length: 64 }, () => 0));
            harness.randomTicks(ORIGIN, 8);
            if (harness.dimension.identifierAt({ ...ORIGIN, y: 6 }) !== subject.bedrock)
                return 'no block grew on top of it';
            return undefined;
        }
    },
    {
        name: 'sapling-grows-tree',
        java: 'A sapling turns into a tree on random ticks once it reaches its second stage.',
        reference: 'Java SaplingBlock randomTick and advanceTree; issue #2909',
        subjects: () => tagMembers('minecraft:saplings').filter((subject) => !subject.javaId.endsWith('azalea')),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(BELOW, 'minecraft:grass_block');
            harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, age_bit: true });
            harness.dimension.setLight(ORIGIN, 15);
            harness.dimension.queueRandom(...Array.from({ length: 64 }, () => 0));
            harness.randomTicks(ORIGIN, 16);
            if (harness.dimension.identifierAt(ORIGIN) === subject.bedrock) return 'it never grew into a tree';
            return undefined;
        }
    },
    {
        name: 'cake-bites',
        java: 'Eating from a cake takes one bite and removes the cake after the seventh.',
        reference: 'Java CakeBlock useWithoutItem',
        subjects: () => named('minecraft:cake'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            for (let bite = 0; bite < 7; bite += 1) harness.interact(ORIGIN);
            if (harness.dimension.identifierAt(ORIGIN) !== 'minecraft:air')
                return 'the cake was still there after seven bites';
            return undefined;
        }
    },
    {
        name: 'lever-toggles',
        java: 'A lever flips between on and off when used and powers the block it is on.',
        reference: 'Java LeverBlock useWithoutItem',
        subjects: () => named('minecraft:lever'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.interact(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'open_bit') !== true) return 'using it did not switch it on';
            harness.interact(ORIGIN);
            if (harness.dimension.stateAt(ORIGIN, 'open_bit') !== false) return 'using it again did not switch it off';
            return undefined;
        }
    },
    {
        name: 'copper-oxidizes',
        java: 'An exposed copper block advances one oxidation stage on random ticks until oxidized; waxed copper never does.',
        reference: 'Java WeatheringCopper.getNext and ChangeOverTimeBlock.changeOverTime',
        subjects: () => weatheringCopper().map((chain) => chain.subject),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const next = weatheringCopper().find((chain) => chain.subject.javaId === subject.javaId)?.next;
            if (next === undefined) return undefined;
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.queueRandom(...Array.from({ length: 4096 }, () => 0));
            for (let tick = 0; tick < 512 && harness.dimension.identifierAt(ORIGIN) === subject.bedrock; tick += 1) {
                harness.randomTick(ORIGIN, tick);
            }
            const now = harness.dimension.identifierAt(ORIGIN);
            if (now === subject.bedrock) return 'it never oxidized';
            if (now !== next.bedrock) return `it oxidized into ${now}, Java's next stage is ${next.bedrock}`;
            return undefined;
        }
    },
    {
        name: 'copper-waxes',
        java: 'Honeycomb seals a copper block into its waxed form, which keeps its oxidation stage.',
        reference: 'Java HoneycombItem.WAXABLES',
        // Java waxes a door or trapdoor only for a sneaking player, which the harness cannot send.
        subjects: () =>
            weatheringCopper()
                .map((chain) => chain.subject)
                .filter((subject) => !/_(door|trapdoor)$/.test(subject.javaId)),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const waxed = subjectOf(`minecraft:waxed_${subject.javaId.replace('minecraft:', '')}`);
            if (waxed === undefined) return undefined;
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.interact(ORIGIN, { itemStack: heldItem('minecraft:honeycomb') });
            const now = harness.dimension.identifierAt(ORIGIN);
            return now === waxed.bedrock ? undefined : `honeycomb left ${now}, Java gives ${waxed.bedrock}`;
        }
    },
    {
        name: 'candle-lights',
        java: 'A candle or candle cake lights when used with flint and steel.',
        reference: 'Java CandleBlock and CandleCakeBlock useItemOn',
        subjects: () => [...tagMembers('minecraft:candles'), ...tagMembers('minecraft:candle_cakes')],
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.interact(ORIGIN, { itemStack: heldItem('minecraft:flint_and_steel') });
            const lit = harness.dimension.stateAt(ORIGIN, 'lit');
            if (lit !== true) return 'flint and steel did not light it';
            return undefined;
        }
    },
    {
        name: 'water-spreads-seven',
        java: 'Water flows seven blocks from a source over a flat floor and no further.',
        reference: 'Java FlowingFluid.getSpreadDelay and WaterFluid.getDropOff',
        subjects: () => named('minecraft:water'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.fill({ x: -10, y: 4, z: -10 }, { x: 10, y: 4, z: 10 }, 'minecraft:stone');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            for (let round = 0; round < 64; round += 1) {
                for (let x = -9; x <= 9; x += 1) {
                    for (let z = -9; z <= 9; z += 1) {
                        const id = harness.dimension.identifierAt({ x, y: 5, z });
                        if (id === 'minecraft:water' || id === 'minecraft:flowing_water') harness.tick({ x, y: 5, z });
                    }
                }
            }
            let reach = 0;
            for (let x = 0; x <= 9; x += 1) {
                const id = harness.dimension.identifierAt({ x, y: 5, z: 0 });
                if (id === 'minecraft:water' || id === 'minecraft:flowing_water') reach = x;
            }
            return reach === 7 ? undefined : `water reached ${reach} blocks from the source`;
        }
    },
    {
        name: 'lava-spreads-three',
        java: 'Lava flows three blocks from a source in the overworld and no further.',
        reference: 'Java LavaFluid.getSlopeFindDistance and getDropOff',
        subjects: () => named('minecraft:lava'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.fill({ x: -10, y: 4, z: -10 }, { x: 10, y: 4, z: 10 }, 'minecraft:stone');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            for (let round = 0; round < 64; round += 1) {
                for (let x = -9; x <= 9; x += 1) {
                    for (let z = -9; z <= 9; z += 1) {
                        const id = harness.dimension.identifierAt({ x, y: 5, z });
                        if (id === 'minecraft:lava' || id === 'minecraft:flowing_lava') harness.tick({ x, y: 5, z });
                    }
                }
            }
            let reach = 0;
            for (let x = 0; x <= 9; x += 1) {
                const id = harness.dimension.identifierAt({ x, y: 5, z: 0 });
                if (id === 'minecraft:lava' || id === 'minecraft:flowing_lava') reach = x;
            }
            return reach === 3 ? undefined : `lava reached ${reach} blocks from the source`;
        }
    },
    {
        name: 'composter-chance',
        java: "A composter takes only compostable items, and each adds a layer with the item's composting chance.",
        reference: 'Java ComposterBlock.addItem and ComposterBlock.COMPOSTABLES; issue #2908',
        subjects: () => named('minecraft:composter'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const layers = (item: string, components: Record<string, unknown>, roll: number): number => {
                const harness = bind(subject);
                harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, composter_fill_level: 1 });
                harness.dimension.queueRandom(roll);
                harness.interact(ORIGIN, { itemStack: heldItem(item, components) });
                const level = harness.dimension.stateAt(ORIGIN, 'composter_fill_level');
                return typeof level === 'number' ? level - 1 : 0;
            };
            if (layers('minecraft:stone', {}, 0) !== 0) return 'a stone added a layer, though it is not compostable';
            if (
                layers(
                    'minecraft:wheat_seeds',
                    { 'minecraft:compostable': { layers: 'minecraft:compostable/low' } },
                    0.99
                ) !== 0
            ) {
                return 'a failed 30 percent roll still added a layer';
            }
            return undefined;
        }
    },
    {
        name: 'sponge-absorbs-water',
        java: 'A sponge placed next to water soaks it up and becomes a wet sponge.',
        reference: 'Java SpongeBlock.tryAbsorbWater; issue #2907',
        subjects: () => named('minecraft:sponge'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set({ x: 1, y: 5, z: 0 }, 'minecraft:water');
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.place(ORIGIN);
            if (harness.dimension.identifierAt({ x: 1, y: 5, z: 0 }) === 'minecraft:water')
                return 'the water stayed after the sponge was placed';
            if (harness.dimension.identifierAt(ORIGIN) === subject.bedrock) return 'the sponge did not become wet';
            return undefined;
        }
    },
    {
        name: 'ice-melts-in-light',
        java: 'Ice melts into water on a random tick when the block light is above 11.',
        reference: 'Java IceBlock.randomTick',
        subjects: () => named('minecraft:ice'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            harness.dimension.setLight(ORIGIN, 14);
            harness.randomTick(ORIGIN);
            return harness.dimension.identifierAt(ORIGIN) === 'minecraft:water'
                ? undefined
                : 'it did not melt in bright light';
        }
    },
    {
        name: 'piston-pushes',
        java: 'A piston receiving power pushes the block in front of it one position.',
        reference: 'Java PistonBaseBlock.checkIfExtend and moveBlocks',
        subjects: () => named('minecraft:piston', 'minecraft:sticky_piston'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            // Bedrock reverses a piston's horizontal facing values, so try each one and look for any push.
            for (const facing of [2, 3, 4, 5]) {
                const harness = bind(subject);
                harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, facing_direction: facing });
                for (const [dx, dz] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1]
                ] as const) {
                    harness.dimension.set({ x: dx, y: 5, z: dz }, 'minecraft:stone');
                }
                harness.redstone(ORIGIN, 15);
                const pushed = (
                    [
                        [2, 0],
                        [-2, 0],
                        [0, 2],
                        [0, -2]
                    ] as const
                ).some(([dx, dz]) => harness.dimension.identifierAt({ x: dx, y: 5, z: dz }) === 'minecraft:stone');
                if (pushed) return undefined;
            }
            return 'it never pushed the block in front of it';
        }
    },
    {
        name: 'breaking-drops-loot',
        java: 'Breaking a block rolls the block loot table Java names for it, and a block with no table drops nothing.',
        reference: 'Java block loot tables, data/minecraft/loot_table/blocks; issue #2914',
        classify: (subject) =>
            subject.javaId.startsWith('minecraft:potted_')
                ? {
                      kind: 'intentional',
                      reason: 'Bedrock has one flower pot block and keeps the plant in its block entity, so the pot rolls the pot table and the plant comes from the entity.'
                  }
                : subject.javaId.endsWith('_plant')
                  ? {
                        kind: 'intentional',
                        reason: 'Bedrock merges a vine or kelp body into its head block, and both tables drop the same item.'
                    }
                  : undefined,
        subjects: () => Object.keys(blocksTable.blocks).flatMap((javaId) => subjectOf(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const content = serverContent();
            const tables = content.definitions.lootTablesJava;
            const wanted = `minecraft:blocks/${subject.javaId.replace('minecraft:', '')}`;
            // Java ties some blocks to another block's table (wall signs to the standing sign), so only a block with its own table is compared.
            if (!tables.has(wanted)) return undefined;
            // A bed or banner keeps its color in the block entity rather than the state, so the
            // block is broken with the record Bedrock would hold for it.
            const dyeIndex = bedrockBlockEntityDyeIndexOf(subject.javaId, subject.bedrock);
            const blockEntity = dyeIndex === undefined ? undefined : { [DYE_INDEX_FIELD]: dyeIndex };
            const table = blockLootTableOf(content, subject.bedrock, subject.states, blockEntity);
            if (table === wanted) return undefined;
            const same =
                table !== undefined &&
                JSON.stringify(tables.get(table)?.data) === JSON.stringify(tables.get(wanted)?.data);
            return same ? undefined : `it rolls ${String(table)}, Java's table is ${wanted}`;
        }
    },
    {
        name: 'stairs-placement',
        java: "A stair faces the way its placer looks, and sits upside down when placed against a block's underside or the upper half of a side.",
        reference: 'Java StairBlock.getStateForPlacement',
        subjects: () => tagMembers('minecraft:stairs'),
        idOf: (subject) => subject.javaId,
        run: (subject) =>
            placementDifference(subject, (facing, face, y) => ({
                facing,
                half: face !== 'down' && (face === 'up' || y <= 0.5) ? 'bottom' : 'top',
                shape: 'straight'
            }))
    },
    {
        name: 'slab-placement',
        java: "A slab takes the top half when placed against a block's underside or the upper half of a side, and the bottom half otherwise.",
        reference: 'Java SlabBlock.getStateForPlacement',
        subjects: () => tagMembers('minecraft:slabs'),
        idOf: (subject) => subject.javaId,
        run: (subject) =>
            placementDifference(subject, (_facing, face, y) => ({
                type: face === 'down' || (face !== 'up' && y > 0.5) ? 'top' : 'bottom'
            }))
    },
    {
        name: 'pops-without-support',
        classify: () => ({
            kind: 'defect',
            reason: "The server's family for this block has no support rule for where Java's canSurvive keeps it, so it stays in thin air.",
            reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3557'
        }),
        java: 'A block whose Java class decides where it can stay (canSurvive) breaks off when nothing around it holds it, once a neighbor changes; farmland and a dirt path, which only mind what is on top, stay.',
        reference: "Each Java block class's canSurvive and updateShape",
        subjects: () =>
            Object.keys(blocksTable.blocks)
                .filter((javaId) => javaBlockBehaviors(javaId).some(({ kind }) => kind.aspect === 'support'))
                .flatMap((javaId): readonly BlockSubject[] => {
                    // A multiface block's default state has no face, which no world holds, so it
                    // is tried hanging under a block, as one placed on a ceiling is.
                    if (!javaBlockIsA(javaId, 'MultifaceBlock')) {
                        const subject = subjectOf(javaId);
                        return subject === undefined ? [] : [subject];
                    }
                    const mapped = javaBlockStateToBedrock(javaId, { up: 'true' });
                    return mapped.kind === 'mapped'
                        ? [{ javaId, bedrock: mapped.bedrock.name, states: mapped.bedrock.states }]
                        : [];
                }),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
            // A neighbor change from each face, since a block checks the face it hangs on when
            // that neighbor changes: below for a candle, above for a vine, behind for a ladder.
            for (const face of ['down', 'up', 'north', 'south', 'west', 'east'] as const) {
                if (harness.dimension.identifierAt(ORIGIN) !== subject.bedrock) break;
                harness.neighborChanged(ORIGIN, face);
            }
            if (harness.dimension.identifierAt(ORIGIN) === subject.bedrock) harness.tick(ORIGIN);
            // The world's own block physics pops what a liquid would wash away once nothing holds
            // it up, beside what the block's family does.
            const stays = harness.dimension.identifierAt(ORIGIN) === subject.bedrock && !needsSupport(subject.bedrock);
            const javaStays = SURVIVES_IN_AIR.some((simple) => javaBlockIsA(subject.javaId, simple));
            if (stays === javaStays) return undefined;
            return stays ? 'it stayed in thin air' : 'it broke in thin air, where Java keeps it';
        }
    },
    {
        name: 'pillar-axis',
        java: "A log, pillar or other rotated pillar placed against a face lies along that face's axis.",
        reference: 'Java RotatedPillarBlock.getStateForPlacement',
        subjects: () =>
            Object.keys(blocksTable.blocks)
                .filter((javaId) => javaBlockIsA(javaId, 'RotatedPillarBlock'))
                .flatMap((javaId) => subjectOf(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            for (const [face, axis] of [
                ['up', 'y'],
                ['down', 'y'],
                ['east', 'x'],
                ['west', 'x'],
                ['north', 'z'],
                ['south', 'z']
            ] as const) {
                const java = javaBlockStateToBedrock(subject.javaId, { axis });
                if (java.kind !== 'mapped') return `Java's ${axis} axis maps to no Bedrock state`;
                const harness = bind(subject);
                harness.dimension.set(ORIGIN, subject.bedrock, subject.states);
                harness.place(ORIGIN, { face });
                const placed = harness.block(ORIGIN).states;
                const differs = Object.entries(java.bedrock.states).find(([name, value]) => placed[name] !== value);
                if (differs !== undefined) {
                    return `placed against ${face} its ${differs[0]} is ${String(placed[differs[0]])}, Java's ${axis} axis is ${String(differs[1])}`;
                }
            }
            return undefined;
        }
    },
    {
        name: 'observer-pulse-delay',
        java: 'An observer schedules its pulse two game ticks after the block in front of it changes.',
        reference: 'Java ObserverBlock.updateShape and startSignal (2 ticks)',
        subjects: () => named('minecraft:observer'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, subject.bedrock, {
                ...subject.states,
                'minecraft:facing_direction': 'east',
                powered_bit: false
            });
            harness.neighborChanged(ORIGIN, 'east');
            const delay = harness.dimension.scheduled.at(-1)?.delay;
            return delay === 2 ? undefined : `it schedules its pulse after ${String(delay)} ticks, Java uses 2`;
        }
    },
    {
        name: 'torch-inversion-delay',
        java: 'A redstone torch inverts two game ticks after its support changes power.',
        reference: 'Java RedstoneTorchBlock.neighborChanged (2 ticks)',
        subjects: () => named('minecraft:redstone_torch'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set({ x: 0, y: 4, z: 0 }, 'minecraft:stone');
            harness.dimension.setPower({ x: 0, y: 4, z: 0 }, 15);
            harness.dimension.set(ORIGIN, subject.bedrock, { ...subject.states, torch_facing_direction: 'top' });
            harness.place(ORIGIN);
            const delay = harness.dimension.scheduled.at(-1)?.delay;
            return delay === 2 ? undefined : `it inverts after ${String(delay)} ticks, Java uses 2`;
        }
    },
    {
        name: 'lamp-off-delay',
        java: 'A lit redstone lamp stays lit for four game ticks after it loses power.',
        reference: 'Java RedstoneLampBlock.neighborChanged (4 ticks)',
        subjects: () => named('minecraft:redstone_lamp'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const harness = bind(subject);
            harness.dimension.set(ORIGIN, 'minecraft:lit_redstone_lamp');
            harness.redstone(ORIGIN, 0);
            const stillLit = harness.dimension.identifierAt(ORIGIN) === 'minecraft:lit_redstone_lamp';
            const delay = harness.dimension.scheduled.at(-1)?.delay;
            if (!stillLit) return 'it went dark the moment power was removed';
            return delay === 4 ? undefined : `it goes dark after ${String(delay)} ticks, Java uses 4`;
        }
    }
];
/**
 * The aspects each block scenario compares, by the Java behavior kind it exercises: the hooks of
 * the Java class it names in its reference, or the property it reads.
 */
const SCENARIO_ASPECTS: Readonly<Record<string, readonly string[]>> = {
    'family-matches-java-group': [],
    'hand-toggle': ['interaction'],
    'button-pulse': ['interaction', 'scheduled-tick'],
    'pressure-plate-trigger': ['entity-contact', 'scheduled-tick'],
    'plant-needs-ground': ['support'],
    'mushroom-needs-dark-or-mycelium': ['support'],
    'door-needs-ground': ['support'],
    'falls-without-support': ['falling'],
    'crop-growth': ['random-tick'],
    'waterlogged-by-two-sources': ['waterlogging'],
    'bottom-slab-holds-water': ['waterlogging'],
    'grass-spread': ['random-tick'],
    'growing-plant-head': ['random-tick'],
    'leaves-decay': ['random-tick'],
    'lamp-follows-power': ['neighbor-update'],
    'concrete-powder-hardens': ['neighbor-update'],
    'tnt-ignites-on-power': ['neighbor-update'],
    'stalk-grows-upward': ['random-tick'],
    'sapling-grows-tree': ['random-tick'],
    'cake-bites': ['interaction'],
    'lever-toggles': ['interaction'],
    'copper-oxidizes': ['random-tick'],
    'copper-waxes': ['waxing'],
    'candle-lights': ['interaction'],
    'water-spreads-seven': ['fluid-flow'],
    'lava-spreads-three': ['fluid-flow'],
    'composter-chance': ['interaction'],
    'sponge-absorbs-water': ['neighbor-update'],
    'ice-melts-in-light': ['random-tick'],
    'piston-pushes': ['neighbor-update'],
    'breaking-drops-loot': ['drops'],
    'observer-pulse-delay': ['neighbor-update'],
    'torch-inversion-delay': ['neighbor-update'],
    'lamp-off-delay': ['neighbor-update', 'scheduled-tick'],
    'pillar-axis': ['placement'],
    'pops-without-support': ['support'],
    'stairs-placement': ['placement'],
    'slab-placement': ['placement']
};

const scenarios: readonly BehaviorScenario<BlockSubject>[] = blockScenarios.map((scenario) => {
    const aspects = SCENARIO_ASPECTS[scenario.name];
    if (aspects === undefined) throw new Error(`block scenario ${scenario.name} names no aspect in SCENARIO_ASPECTS`);
    return { ...scenario, aspects: scenario.aspects ?? (() => aspects) };
});

/** Java's defaults for the movement properties, which only a block that changes one has a row for. */
const MOVEMENT_DEFAULTS: Readonly<Record<string, number>> = {
    friction: 0.6,
    speedFactor: 1,
    jumpFactor: 1,
    bounceRestitution: 0,
    fallDistanceReduction: 0
};

/**
 * The behaviors one Java block has that full parity has to compare with Java, all read from Java's
 * own data rather than from what the server implements:
 *
 * - its drops when Java gives it a loot table, and its random tick when Java random-ticks a state;
 * - how long it takes to mine, what a blast does to it, and how a piston moves it, for every block
 *   a player can target;
 * - the light it gives, fire's odds on it and how it changes an entity's movement, when Java's
 *   property dump gives it any;
 * - each behavior kind its Java class adds to the plain block: the `BlockBehaviour` hooks it
 *   overrides (using it, its scheduled tick, its support, its neighbor updates, its placement,
 *   its redstone signal, entity contact, projectiles, breaking) and the interfaces it implements
 *   (a block entity, bone meal, falling, holding water). See `javaBlockClasses.ts`.
 */
const blockAspects = (javaId: string): readonly BehaviorAspect[] => {
    const java = javaBlockRows()[javaId];
    const states = [java?.base ?? {}, ...Object.values(java?.stateOverrides ?? {})];
    const any = (field: string, test: (value: unknown) => boolean) => states.some((values) => test(values[field]));
    const aspects: BehaviorAspect[] = [];
    const lootTable = `minecraft:blocks/${javaId.replace('minecraft:', '')}`;
    if (serverContent().definitions.lootTablesJava.has(lootTable)) {
        aspects.push({ id: 'drops', description: `what breaking it drops, against Java's ${lootTable}` });
    }
    if (any('randomTick', (value) => value === true)) {
        aspects.push({ id: 'random-tick', description: 'what a random tick does to it, against Java' });
    }
    if (!javaBlockIsA(javaId, 'AirBlock')) {
        if (!javaBlockIsA(javaId, 'LiquidBlock')) {
            aspects.push(
                {
                    id: 'mining',
                    description: 'how many ticks it takes to break by hand and with each tool, against Java'
                },
                { id: 'explosion', description: 'what a blast does to it, against Java' }
            );
        }
        aspects.push({ id: 'piston', description: 'whether a piston moves, destroys or stops at it, against Java' });
    }
    if (any('lightEmission', (value) => typeof value === 'number' && value > 0)) {
        aspects.push({ id: 'light', description: 'the light it gives in each state, against Java' });
    }
    if (
        any('igniteOdds', (value) => typeof value === 'number' && value > 0) ||
        any('burnOdds', (value) => typeof value === 'number' && value > 0)
    ) {
        aspects.push({
            id: 'flammability',
            description: "fire's odds of catching on it and burning it away, against Java"
        });
    }
    if (
        Object.entries(MOVEMENT_DEFAULTS).some(([field, value]) =>
            any(field, (actual) => typeof actual === 'number' && actual !== value)
        )
    ) {
        aspects.push({
            id: 'movement',
            description: 'how it changes the speed, jump, sliding or fall of an entity on it, against Java'
        });
    }
    for (const { kind, evidence } of javaBlockBehaviors(javaId)) {
        aspects.push({ id: kind.aspect, description: `${kind.description} (${evidence.join(', ')}), against Java` });
    }
    return aspects;
};

const REFERENCES_NEEDED = [
    REFERENCES.javaBlockRegistry,
    REFERENCES.javaServerJar,
    REFERENCES.bedrockBehaviorPack,
    REFERENCES.javaWorldgenData
] as const;

describeFamily(FAMILIES.blocksBehavior, REFERENCES_NEEDED, () => {
    // The first read of the server content builds the whole pinned stack, overlays and all.
    it('prevents pushing and pulling bedrock using the shipped server definition', { timeout: 180_000 }, () => {
        const world = createVoxelWorld().overworld;
        const properties = serverContent()
            .blocks.types.get('minecraft:bedrock')!
            .state()
            .content.params(blockProperties)!;
        world.defineProperties('minecraft:bedrock', properties);
        const origin = { x: 0, y: 0, z: 0 };
        const front = { x: 1, y: 0, z: 0 };
        const beyond = { x: 2, y: 0, z: 0 };
        world.set(front, 'minecraft:bedrock');
        expect(planPush(world, origin, 'east')).toMatchObject({ blocked: true, moved: [] });
        expect(performPush(world, origin, 'east')).toBe(false);
        expect(world.identifierAt(front)).toBe('minecraft:bedrock');
        expect(world.identifierAt(beyond)).toBe('minecraft:air');
        world.set(front, 'minecraft:air');
        world.set(beyond, 'minecraft:bedrock');
        expect(performPull(world, origin, 'east')).toBe(false);
        expect(world.identifierAt(beyond)).toBe('minecraft:bedrock');
        expect(world.identifierAt(front)).toBe('minecraft:air');
    });

    it('exercises each Java block behavior against the server block families', { timeout: 180_000 }, () => {
        const rows = measureScenarios(
            FAMILIES.blocksBehavior,
            import.meta.filename,
            scenarioGroup(scenarios),
            scenarioGroup(blockPropertyScenarios)
        );

        reportCoverage(
            FAMILIES.blocksBehavior,
            import.meta.filename,
            Object.keys(blocksTable.blocks).sort((left, right) => left.localeCompare(right, 'en')),
            rows,
            "No scenario compares this block's Java placement, update, ticking, interaction or block-entity behavior with the server.",
            blockAspects
        );
        expect(rows.length).toBeGreaterThan(0);
    });
});
