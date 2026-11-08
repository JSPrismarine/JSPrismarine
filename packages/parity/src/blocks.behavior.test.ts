import { VANILLA_BLOCK_FAMILIES, bindFamily, heldItem, isFallingBlock } from '@jsprismarine/block-behaviors';
import type { FamilyHarness } from '@jsprismarine/block-behaviors';
import { behaviorFor } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { blocksTable } from '@jsprismarine/mapping/tables';
import { blockLootTableOf } from '@jsprismarine/prismarine/block/blockLoot';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
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

const scenarios: readonly BehaviorScenario<BlockSubject>[] = [
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
            const table = blockLootTableOf(content, subject.bedrock, subject.states);
            if (table === wanted) return undefined;
            const same =
                table !== undefined &&
                JSON.stringify(tables.get(table)?.data) === JSON.stringify(tables.get(wanted)?.data);
            return same ? undefined : `it rolls ${String(table)}, Java's table is ${wanted}`;
        }
    }
];
const REFERENCES_NEEDED = [
    REFERENCES.javaBlockRegistry,
    REFERENCES.bedrockBehaviorPack,
    REFERENCES.javaWorldgenData
] as const;

describeFamily(FAMILIES.blocksBehavior, REFERENCES_NEEDED, () => {
    it('exercises each Java block behavior against the server block families', { timeout: 180_000 }, () => {
        const rows = measureScenarios(FAMILIES.blocksBehavior, import.meta.filename, scenarioGroup(scenarios));

        reportCoverage(
            FAMILIES.blocksBehavior,
            import.meta.filename,
            Object.keys(blocksTable.blocks).sort((left, right) => left.localeCompare(right, 'en')),
            rows,
            "No scenario compares this block's Java placement, update, ticking, interaction or block-entity behavior with the server."
        );
        expect(rows.length).toBeGreaterThan(0);
    });
});
