import { bedrockBlockStateToJava, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type { BlockStateValue } from '@jsprismarine/mapping';

import type { ContentEntity } from '@jsprismarine/prismarine/content/world/adapter';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import { withProbe } from './goalProbe.ts';
import { javaAncestry, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring } from './subjects.ts';

/**
 * The last entity rows of the parity tracker: behavior no earlier theme measured, each compared
 * with the Java rule the pinned jar runs.
 */

const BLOCK_PACKAGE = 'net/minecraft/world/level/block/';
const BEE = 'net/minecraft/world/entity/animal/bee/Bee';
const GROW_CROP_GOAL = `${BEE}$BeeGrowCropGoal`;

/** One Java block state, as the mapping tables spell it. */
interface JavaState {
    readonly name: string;
    readonly properties: Readonly<Record<string, string>>;
}

/** A block a bee flies over, with the Java class that decides how it grows. */
interface GrowthCase {
    readonly state: JavaState;
    readonly javaClass: string;
    /** The Java state under it, which a cave vine needs to be the plant rather than the tip. */
    readonly under?: JavaState;
}

/** A fresh wheat crop, which a bee with a hive grows and a bee without one leaves. */
const WHEAT: GrowthCase = { state: { name: 'minecraft:wheat', properties: { age: '0' } }, javaClass: 'CropBlock' };

/** The blocks of `#minecraft:bee_growables` a bee is tried over, one of each Java branch. */
const GROWTH_CASES: readonly GrowthCase[] = [
    WHEAT,
    { state: { name: 'minecraft:beetroots', properties: { age: '2' } }, javaClass: 'BeetrootBlock' },
    { state: { name: 'minecraft:beetroots', properties: { age: '3' } }, javaClass: 'BeetrootBlock' },
    { state: { name: 'minecraft:torchflower_crop', properties: { age: '1' } }, javaClass: 'TorchflowerCropBlock' },
    { state: { name: 'minecraft:pumpkin_stem', properties: { age: '6' } }, javaClass: 'StemBlock' },
    { state: { name: 'minecraft:sweet_berry_bush', properties: { age: '2' } }, javaClass: 'SweetBerryBushBlock' },
    {
        state: { name: 'minecraft:cave_vines_plant', properties: { berries: 'false' } },
        javaClass: 'CaveVinesPlantBlock',
        under: { name: 'minecraft:cave_vines', properties: { age: '0', berries: 'false' } }
    },
    {
        state: { name: 'minecraft:pitcher_crop', properties: { age: '0', half: 'lower' } },
        javaClass: 'PitcherCropBlock'
    }
];

/** The first number `BeeGrowCropGoal.tick` pushes after it reads a field, such as the 7 a stem's age is held under. */
const numberAfterField = (field: string): number | undefined => {
    const tick = javaMethodOf(GROW_CROP_GOAL, 'tick');
    if (tick === undefined) return undefined;
    const operations = javaOperations(tick.method);
    const index = operations.findIndex((operation) => operation.kind === 'field' && operation.target === field);
    const found = operations.slice(index + 1).find((operation) => operation.kind === 'number');
    return index < 0 || found?.kind !== 'number' ? undefined : found.value;
};

/**
 * What Java's `BeeGrowCropGoal.tick` makes of one block, read from the pinned jar: a `CropBlock`
 * one age further up to its `getMaxAge` (`getStateForAge`, which a torchflower crop turns into a
 * torchflower), a `StemBlock` and the sweet berry bush up to the bound the goal checks, cave vines
 * a berry; anything else stays.
 */
const javaGrowth = (growth: GrowthCase): JavaState | undefined | string => {
    const className = `${BLOCK_PACKAGE}${growth.javaClass}`;
    const ancestry = javaAncestry(className);
    if (ancestry.length === 0) return `the jar holds no ${growth.javaClass}`;
    const age = Number(growth.state.properties.age);
    const aged = (next: number): JavaState => ({
        name: growth.state.name,
        properties: { ...growth.state.properties, age: String(next) }
    });
    if (ancestry.includes('CropBlock')) {
        const max = javaMethodOf(className, 'getMaxAge');
        const maxAge = max === undefined ? undefined : pushedNumbers(max.method)[0];
        if (maxAge === undefined) return `${growth.javaClass}.getMaxAge pushes no age`;
        if (age >= maxAge) return undefined;
        const stateForAge = javaMethodOf(className, 'getStateForAge');
        const becomes = stateForAge?.method.instructions.find(
            (instruction) => instruction.member?.startsWith(`${BLOCK_PACKAGE}Blocks.`) === true
        )?.member;
        return becomes !== undefined && age + 1 === maxAge
            ? { name: `minecraft:${becomes.slice(becomes.lastIndexOf('.') + 1).toLowerCase()}`, properties: {} }
            : aged(age + 1);
    }
    if (ancestry.includes('StemBlock')) {
        const bound = numberAfterField('StemBlock.AGE');
        if (bound === undefined) return 'BeeGrowCropGoal.tick checks no stem age';
        return age < bound ? aged(age + 1) : undefined;
    }
    if (growth.javaClass === 'SweetBerryBushBlock') {
        const bound = numberAfterField('SweetBerryBushBlock.AGE');
        if (bound === undefined) return 'BeeGrowCropGoal.tick checks no berry bush age';
        return age < bound ? aged(age + 1) : undefined;
    }
    if (ancestry.includes('CaveVinesPlantBlock') || ancestry.includes('CaveVinesBlock'))
        return growth.state.properties.berries === 'false'
            ? { name: growth.state.name, properties: { ...growth.state.properties, berries: 'true' } }
            : undefined;
    return undefined;
};

/** The block's Java state as its Bedrock form maps back, written the same way as a case's. */
const spelled = (state: JavaState | undefined): string =>
    state === undefined
        ? 'unchanged'
        : `${state.name}[${Object.entries(state.properties)
              .filter(([name]) => name === 'age' || name === 'berries')
              .map(([name, value]) => `${name}=${value}`)
              .join(',')}]`;

/** A block's states with the values a block state holds, which is every value the world keeps. */
const blockStates = (states: Readonly<Record<string, unknown>> | undefined): Record<string, BlockStateValue> =>
    Object.fromEntries(
        Object.entries(states ?? {}).flatMap(([name, value]) =>
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? [[name, value]] : []
        )
    );

/** How long a probe waits for a bee to grow a block: many times the 15 selector updates a growth waits on average. */
const GROWTH_WAIT = 1_200;

/**
 * Runs a nectar-carrying bee over one block for {@link GROWTH_WAIT} ticks, with or without its hive,
 * and returns the Java state the block first changed into, or undefined when it never changed.
 */
const beeGrows = (bedrock: string, growth: GrowthCase, withHive: boolean): JavaState | undefined | string => {
    const bedrockBlock = javaBlockStateToBedrock(growth.state.name, growth.state.properties);
    if (bedrockBlock.kind === 'unknown') return `no Bedrock block maps from ${spelled(growth.state)}`;
    const under =
        growth.under === undefined ? undefined : javaBlockStateToBedrock(growth.under.name, growth.under.properties);
    if (under?.kind === 'unknown') return `no Bedrock block maps from ${spelled(growth.under)}`;
    return withProbe(
        bedrock,
        // Above `canBeeUse`'s 0.3, then under the 1 in 15 the tick draws, over and over.
        { groups: ['has_nectar'], keep: ['minecraft:grows_crop'], random: [0.9, 0.01, 0.6, 0.02] },
        (probe) => {
            probe.fill([-1, -3, -1], [1, -1, 1], 'minecraft:air');
            probe.block(0, -4, 0, 'minecraft:stone');
            probe.block(0, -1, 0, bedrockBlock.bedrock.name, bedrockBlock.bedrock.states);
            if (under === undefined) probe.block(0, -2, 0, 'minecraft:barrier');
            else probe.block(0, -2, 0, under.bedrock.name, under.bedrock.states);
            probe.block(0, 0, 0, 'minecraft:air');
            if (withHive) probe.block(4, 0, 0, 'minecraft:beehive');
            probe.entity.body.home = probe.at(4, 0, 0);
            const seen = (): string => `${probe.blockAt(0, -1, 0)}${JSON.stringify(probe.statesAt(0, -1, 0))}`;
            const before = seen();
            const changed = probe.until(() => seen() !== before, GROWTH_WAIT);
            if (changed === undefined) return undefined;
            const identifier = probe.blockAt(0, -1, 0);
            const states = probe.statesAt(0, -1, 0);
            if (identifier === undefined) return 'the block disappeared';
            const java = bedrockBlockStateToJava(identifier, blockStates(states));
            return java.kind === 'mapped' ? java.java : `no Java block maps from ${identifier}`;
        }
    );
};

const compareCropGrowth = (subject: EntitySubject): string | undefined => {
    const canUse = javaMethodOf(GROW_CROP_GOAL, 'canBeeUse');
    if (canUse === undefined) return "Java's bee no longer grows crops";
    const differences: string[] = [];
    for (const growth of GROWTH_CASES) {
        const java = javaGrowth(growth);
        if (typeof java === 'string') return java;
        const server = beeGrows(subject.bedrock, growth, true);
        if (typeof server === 'string') return server;
        if (spelled(server) !== spelled(java))
            differences.push(
                `over ${spelled(growth.state)} it makes ${spelled(server)}, where Java makes ${spelled(java)}`
            );
    }
    const homeless = beeGrows(subject.bedrock, WHEAT, false);
    if (homeless !== undefined)
        differences.push(`without its hive it still grows ${spelled(WHEAT.state)}, where Java's isHiveValid stops it`);
    return differences.length === 0 ? undefined : differences.join('; ');
};

const PHANTOM_SPAWNER = 'net/minecraft/world/level/levelgen/PhantomSpawner';

/**
 * What Java's `PhantomSpawner.tick` reads, from the pinned jar: the ticks without rest it waits for,
 * and whether it reads `Stats.TIME_SINCE_REST` at all.
 */
const javaInsomnia = (): { readonly restTicks: number } | string => {
    const tick = pinnedJavaClass(PHANTOM_SPAWNER).find((method) => method.name === 'tick');
    if (tick === undefined) return "Java's PhantomSpawner is gone";
    const operations = javaOperations(tick);
    const read = operations.findIndex(
        (operation) => operation.kind === 'field' && operation.target === 'Stats.TIME_SINCE_REST'
    );
    if (read < 0) return "Java's PhantomSpawner no longer reads the time since rest";
    // `random.nextInt(timeSinceRest) >= 72000`: the number pushed right after that draw.
    const after = operations.slice(read);
    const draw = after.findIndex((operation) => operation.kind === 'call' && operation.target.endsWith('.nextInt'));
    const bound = draw < 0 ? undefined : after[draw + 1];
    return bound?.kind === 'number'
        ? { restTicks: bound.value }
        : 'PhantomSpawner.tick compares the draw with no number';
};

/** Ticks a probe waits for the spawner's next look: Java's longest countdown, `(60 + 59) * 20`, and a margin. */
const PHANTOM_WAIT = 2_400;

/**
 * Stands players under the open night sky, one for each time since rest, waits for the phantom
 * spawner's next look and counts the phantoms that came within 40 blocks of each.
 */
const phantomsOver = (restTicks: readonly number[]): readonly number[] =>
    withProbe('minecraft:armor_stand', { keep: [], random: [0.3] }, (probe) => {
        const dayTime = probe.world.world.level.dayTime();
        // Midnight, the darkest the overworld sky gets.
        probe.world.advance((18_000 - dayTime + 24_000) % 24_000);
        const players: ContentEntity[] = restTicks.map((timeSinceRest, index) => ({
            id: 9_500_000 + index,
            identifier: 'minecraft:player',
            position: probe.at(index * 120, 0, 0),
            timeSinceRest
        }));
        const before = probe.world.players;
        probe.world.players = [...before, ...players];
        try {
            probe.tick(PHANTOM_WAIT);
            const phantoms = [...probe.runtime.entities()].filter(
                (entity) => entity.identifier === 'minecraft:phantom' && entity.removed === undefined
            );
            const counts = players.map(
                (player) =>
                    phantoms.filter(
                        (phantom) =>
                            Math.abs(phantom.position.x - player.position.x) <= 40 &&
                            Math.abs(phantom.position.z - player.position.z) <= 40
                    ).length
            );
            for (const phantom of phantoms) probe.runtime.remove(phantom.id, 'parity probe');
            return counts;
        } finally {
            probe.world.players = before;
        }
    });

const compareInsomnia = (): string | undefined => {
    const java = javaInsomnia();
    if (typeof java === 'string') return java;
    // Three days and more without rest, and one tick short of three days: the draw of 0.3 the
    // probe world gives beats Java's bound only for the sleepless one.
    const sleepless = 100 * java.restTicks;
    const [overSleepless = 0, overRested = 0] = phantomsOver([sleepless, java.restTicks - 1]);
    const differences: string[] = [];
    if (overSleepless === 0)
        differences.push(`no phantom comes for a player ${sleepless} ticks without rest, where Java sends them`);
    if (overRested > 0)
        differences.push(
            `${overRested} phantoms come for a player ${java.restTicks - 1} ticks without rest, where Java waits for ${java.restTicks}`
        );
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** The scenarios of the finishing theme. */
export const finishingScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'bee-grows-crops',
        java: "A bee carrying nectar, with a hive to go back to, grows the crop, stem, berry bush or cave vine under it one step at a time, as Java's BeeGrowCropGoal does, and leaves the pitcher crop and a grown block alone.",
        reference:
            'Java Bee$BeeGrowCropGoal.canBeeUse (getCropsGrownSincePollination < 10, nextFloat() >= 0.3, hasNectar, isHiveValid) and tick (nextInt(adjustedTickDelay(30)), below(1) and below(2), #bee_growables, CropBlock.getStateForAge, StemBlock.AGE < 7, SweetBerryBushBlock.AGE < 3, CaveVines berries), CropBlock, BeetrootBlock and TorchflowerCropBlock getMaxAge and Bee.isHiveValid, read from the pinned jar; issue #3194',
        subjects: () => entitiesDeclaring('minecraft:grows_crop'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:grows_crop'],
        run: compareCropGrowth
    },
    {
        name: 'insomnia-calls-phantoms',
        java: "Phantoms spawn over a player who has not slept for three days, and only over such a player, by Java's PhantomSpawner.",
        reference:
            'Java PhantomSpawner.tick (spawnPhantoms game rule, getSkyDarken() < 5, getSeaLevel and canSeeSky, isHarderThan(nextFloat() * 3), Stats.TIME_SINCE_REST clamped and random.nextInt(timeSinceRest) >= 72000, 20 + nextInt(15) up, 1 + nextInt(difficulty + 1) phantoms), ServerPlayer.doTick, startSleeping and die (TIME_SINCE_REST), read from the pinned jar; issue #3191',
        subjects: () =>
            entitiesDeclaring('minecraft:insomnia').filter((subject) => subject.javaId === 'minecraft:player'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:insomnia'],
        run: compareInsomnia
    }
];
