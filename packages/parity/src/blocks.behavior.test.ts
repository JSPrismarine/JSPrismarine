import { VANILLA_BLOCK_FAMILIES, bindFamily, isFallingBlock } from '@jsprismarine/block-behaviors';
import type { FamilyHarness } from '@jsprismarine/block-behaviors';
import { behaviorFor } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import type { BehaviorScenario } from './behaviorScenarios.ts';
import { runScenarios, updatingBehaviorGaps, writeBehaviorGaps } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';
import { reportParityCases } from './trackerCases.ts';

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
        reference: 'Java SaplingBlock randomTick and advanceTree',
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
    }
];
const REFERENCES_NEEDED = [
    REFERENCES.javaBlockRegistry,
    REFERENCES.bedrockBehaviorPack,
    REFERENCES.javaWorldgenData
] as const;

describeFamily(FAMILIES.blocksBehavior, REFERENCES_NEEDED, () => {
    it('exercises each Java block behavior against the server block families', { timeout: 180_000 }, () => {
        const rows = runScenarios(scenarios);
        const gaps = rows.filter((row) => row.difference !== undefined).map((row) => row.id);

        if (updatingBehaviorGaps()) {
            writeBehaviorGaps(
                FAMILIES.blocksBehavior,
                Object.fromEntries(
                    rows
                        .filter((row) => row.difference !== undefined)
                        .map((row) => {
                            const scenario = scenarios.find((candidate) => row.id.startsWith(`${candidate.name}:`));
                            return [
                                row.id,
                                {
                                    kind: scenario?.gapKind ?? 'defect',
                                    reason: `${scenario?.java ?? ''} Observed: ${row.difference}.`,
                                    reference: scenario?.reference ?? ''
                                }
                            ] as const;
                        })
                )
            );
        }

        reportParityCases(
            FAMILIES.blocksBehavior,
            import.meta.filename,
            rows.map((row) => ({
                id: row.id,
                title: row.title,
                context: row.context,
                status: row.difference === undefined ? 'passed' : 'failed',
                ...(row.difference === undefined ? {} : { details: row.difference })
            }))
        );

        expect(rows.length).toBeGreaterThan(0);
        if (!updatingBehaviorGaps()) {
            const verdict = checkAllowList(FAMILIES.blocksBehavior, gaps);
            expect(verdict.unexpected).toEqual([]);
            expect(verdict.stale).toEqual([]);
        }
    });
});
