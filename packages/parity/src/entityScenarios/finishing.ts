import { bedrockBlockStateToJava, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type { BlockStateValue } from '@jsprismarine/mapping';

import type { ContentEntity } from '@jsprismarine/prismarine/content/world/adapter';
import { EntityBossBars, ownBossBarOf } from '@jsprismarine/prismarine/entity/data/bossBars';
import type { BossBarViewer } from '@jsprismarine/prismarine/entity/data/bossBars';
import { isInDragonArena } from '@jsprismarine/prismarine/world/end/DragonFight';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import { withProbe } from './goalProbe.ts';
import { javaAncestry, javaEntityClassName, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
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

/** A player whose client tracks the entities in its set, as the boss bars ask of a session. */
class TrackingViewer implements BossBarViewer {
    public readonly tracked = new Set<bigint>();
    public tracks(runtimeId: bigint): boolean {
        return this.tracked.has(runtimeId);
    }
}

/** Whether a Java entity class's code reaches a member, such as `ServerBossEvent.addPlayer`, in one of its methods. */
const javaCalls = (className: string, method: string, member: string): boolean =>
    javaMethodOf(className, method)?.method.calls.some((call) => call.endsWith(member)) === true;

/**
 * The wither's own bar against Java's `WitherBoss`: shown to the players tracking it and to nobody
 * else, taken off a player who stops tracking it, and as full as its health.
 */
const compareWitherBar = (subject: EntitySubject): string | undefined => {
    const className = javaEntityClassName(subject.javaId);
    if (
        !javaCalls(className, 'startSeenByPlayer', 'ServerBossEvent.addPlayer') ||
        !javaCalls(className, 'stopSeenByPlayer', 'ServerBossEvent.removePlayer') ||
        !javaCalls(className, 'customServerAiStep', 'ServerBossEvent.setProgress')
    )
        return "Java's wither no longer shows its bar to the players tracking it";
    return withProbe(subject.bedrock, { keep: [] }, (probe) => {
        const shown = new Map<TrackingViewer, boolean>();
        let progress: number | undefined;
        const bars = new EntityBossBars<TrackingViewer>((_entity, opened) => {
            progress = opened.progress;
            return {
                show: (viewer) => shown.set(viewer, true),
                hide: (viewer) => shown.set(viewer, false),
                setProgress: (value) => {
                    progress = value;
                },
                setName: () => {},
                close: () => shown.clear()
            };
        });
        const [tracking, distant] = [new TrackingViewer(), new TrackingViewer()];
        const id = BigInt(probe.entity.id);
        tracking.tracked.add(id);
        const differences: string[] = [];
        const health = probe.entity.instance.attributes.get('health');
        if (health === undefined) return 'the wither has no health';
        probe.entity.instance.attributes.set('health', health.max / 4);
        bars.sync(probe.runtime.entities(), [tracking, distant]);
        if (shown.get(tracking) !== true) differences.push('a player tracking it never sees its bar');
        if (shown.get(distant) === true) differences.push('a player not tracking it sees its bar');
        if (progress !== 0.25) differences.push(`at a quarter of its health its bar is ${String(progress)} full`);
        tracking.tracked.delete(id);
        bars.sync(probe.runtime.entities(), [tracking, distant]);
        if (shown.get(tracking) === true) differences.push('a player who stops tracking it keeps its bar');
        return differences.length === 0 ? undefined : differences.join('; ');
    });
};

/**
 * The ender dragon's bar against Java's: `EnderDragon` carries none of its own, and
 * `EnderDragonFight` shows the fight's to the players within its `validPlayer` distance of the
 * arena's center, read from the pinned jar.
 */
const compareDragonBar = (subject: EntitySubject): string | undefined => {
    const fight = pinnedJavaClass('net/minecraft/world/level/dimension/end/EnderDragonFight').find(
        (method) => method.name === 'init' && method.calls.some((call) => call.endsWith('.withinDistance'))
    );
    if (fight === undefined) return "Java's dragon fight no longer picks its players by distance";
    const operations = javaOperations(fight);
    const at = operations.findIndex(
        (operation) => operation.kind === 'call' && operation.target.endsWith('.withinDistance')
    );
    const numbers = operations
        .slice(0, at)
        .flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []));
    const [centerY, radius] = numbers.slice(-2);
    if (centerY === undefined || radius === undefined) return 'EnderDragonFight pushes no arena distance';
    const javaIn = (x: number, y: number, z: number): boolean => x * x + (y - centerY) ** 2 + z * z <= radius * radius;
    const differences: string[] = [];
    for (const [x, y, z] of [
        [0, 70, 0],
        [0, centerY, radius - 1],
        [0, centerY, radius + 1],
        [radius * 0.75, centerY + radius * 0.75, 0],
        [-radius, 0, 0]
    ] as const) {
        const java = javaIn(x, y, z);
        if (isInDragonArena({ x, y, z }) !== java)
            differences.push(
                `a player at (${x}, ${y}, ${z}) ${java ? 'does not see' : 'sees'} the dragon's bar, where Java ${java ? 'shows' : 'hides'} it`
            );
    }
    if (javaCalls(javaEntityClassName(subject.javaId), 'startSeenByPlayer', 'ServerBossEvent.addPlayer'))
        return "Java's dragon now carries a bar of its own";
    const own = withProbe(subject.bedrock, { keep: [] }, (probe) => ownBossBarOf(probe.entity));
    if (own !== undefined) differences.push("the dragon shows a bar of its own beside the fight's");
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
    },
    {
        name: 'boss-bar',
        java: "The wither shows its boss bar to every player tracking it, with its health as the bar's progress, and the ender dragon's bar is its fight's, shown to the players in the arena.",
        reference:
            'Java WitherBoss (ServerBossEvent, startSeenByPlayer addPlayer, stopSeenByPlayer removePlayer and customServerAiStep setProgress), EnderDragon, which has no bar of its own, and EnderDragonFight (validPlayer withinDistance(0, 128, 0, 192), updatePlayers, dragonEvent.setProgress), read from the pinned jar; issue #3197',
        subjects: () => entitiesDeclaring('minecraft:boss'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:boss'],
        run: (subject) =>
            subject.javaId === 'minecraft:ender_dragon' ? compareDragonBar(subject) : compareWitherBar(subject)
    }
];
