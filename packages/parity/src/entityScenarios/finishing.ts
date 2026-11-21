import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EntityPosition } from '@jsprismarine/entities';
import { Activities, MemoryModuleTypes } from '@jsprismarine/entity-brains';
import { bedrockBlockStateToJava, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type { BlockStateValue } from '@jsprismarine/mapping';

import type { ContentEntity } from '@jsprismarine/prismarine/content/world/adapter';
import { EntityBossBars, ownBossBarOf } from '@jsprismarine/prismarine/entity/data/bossBars';
import type { BossBarViewer } from '@jsprismarine/prismarine/entity/data/bossBars';
import { isInDragonArena } from '@jsprismarine/prismarine/world/end/DragonFight';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import { unpackVanillaDatapack } from '../javaDatapack.ts';
import { loadJavaEntityAttributes } from '../goldens.ts';
import { serverContent } from '../serverStack.ts';
import { withProbe } from './goalProbe.ts';
import { inSandbox, SANDBOX_ORIGIN } from './sandbox.ts';
import { javaAncestry, javaEntityClassName, javaMethodOf, numberNear, pushedNumbers } from './javaEntityCode.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring, field, mappedEntity } from './subjects.ts';

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

/**
 * Whether an enderman that rides a minecart, or one that stands beside it, leaves its spot when an
 * arrow hits it, which Java's `Enderman.hurtServer` answers with up to 64 teleports.
 */
const endermanDodges = (bedrock: string, riding: boolean): boolean | string =>
    // Every draw at 0.75 aims a teleport 16 blocks away on each axis.
    withProbe(bedrock, { keep: [], random: [0.75] }, (probe) => {
        const cart = probe.spawn('minecraft:minecart', 0, 0, 0);
        if (riding) {
            const seat = probe.runtime.mobById(cart.id);
            if (seat !== undefined) probe.runtime.mount(probe.entity.body, seat);
            if (probe.runtime.vehicleOf(probe.entity.body)?.id !== cart.id)
                return 'it cannot ride a minecart to be tested';
        }
        const start = { ...probe.entity.position };
        const arrow = probe.spawn('minecraft:arrow', -3, 1.5, 0);
        arrow.body.velocity = { x: 1.5, y: 0, z: 0 };
        probe.tick(10);
        const at = probe.entity.position;
        return Math.hypot(at.x - start.x, at.z - start.z) > 2;
    });

/** A riding enderman against Java's: `Enderman.teleport(x, y, z)` refuses a passenger before anything else. */
const compareEndermanRiding = (subject: EntitySubject): string | undefined => {
    const teleport = pinnedJavaClass(javaEntityClassName(subject.javaId)).find(
        (method) => method.name === 'teleport' && method.descriptor === '(DDD)Z'
    );
    if (teleport === undefined || teleport.calls[0]?.endsWith('.isPassenger') !== true)
        return "Java's enderman no longer refuses to teleport a passenger first";
    const free = endermanDodges(subject.bedrock, false);
    if (typeof free === 'string') return free;
    if (!free)
        return 'an enderman on its feet never dodges the arrow in the probe, so a riding one cannot be told apart';
    const riding = endermanDodges(subject.bedrock, true);
    if (typeof riding === 'string') return riding;
    return riding
        ? 'an enderman riding a minecart teleports out of it from an arrow, where Java keeps a passenger in its seat'
        : undefined;
};

/** Whether a Java class's own code calls a method whose name ends with `member`, in any of its methods. */
const javaClassCalls = (className: string, member: string): boolean =>
    pinnedJavaClass(className).some((method) => method.calls.some((call) => call.endsWith(member)));

/**
 * A trader llama off its trader's lead against Java's `TraderLlama`: neither it nor
 * `WanderingTraderSpawner` ever tames one, so it stays wild until a player tames it.
 */
const compareFreedTraderLlama = (subject: EntitySubject): string | undefined => {
    const spawner = 'net/minecraft/world/entity/npc/wanderingtrader/WanderingTraderSpawner';
    if (javaClassCalls(javaEntityClassName(subject.javaId), '.setTamed') || javaClassCalls(spawner, '.setTamed'))
        return "Java's trader llama is now tamed by its own code";
    // As `minecraft:from_wandering_trader` spawns one beside its trader, here with no lead on it.
    const groups = ['minecraft:llama_wandering_trader', 'minecraft:llama_persistence'];
    return withProbe(subject.bedrock, { keep: [], groups }, (probe) => {
        probe.tick(20);
        return probe.entity.instance.hasComponent('minecraft:is_tamed')
            ? 'a trader llama with no lead on it tames itself, where Java keeps it wild for a player to tame'
            : undefined;
    });
};

/**
 * Whether a player can put a lead on a mount, with the component groups given added and with a
 * mob riding it or not, as the server's lead attaches one.
 */
const mountTakesLead = (bedrock: string, groups: readonly string[], rider: string | undefined): boolean | string =>
    withProbe(bedrock, { keep: [], groups }, (probe) => {
        if (rider !== undefined) {
            const mob = probe.spawn(rider, 0, 0, 0);
            const mount = probe.runtime.mobById(probe.entity.id);
            if (mount !== undefined) probe.runtime.mount(mob.body, mount);
            if (probe.runtime.vehicleOf(mob.body)?.id !== probe.entity.id)
                return `a ${rider} cannot ride it to be tested`;
        }
        probe.tick(5);
        const player = probe.player(1, 0, 0);
        return probe.runtime.attachLead(player, probe.entity.id);
    });

/**
 * A zombie horse's lead against Java's `ZombieHorse.canBeLeashed`: a tamed one always takes a
 * lead, and a wild one only while no mob rides it (`isMobControlled`).
 */
const compareZombieHorseLead = (subject: EntitySubject): string | undefined => {
    const className = javaEntityClassName(subject.javaId);
    const canBeLeashed = javaMethodOf(className, 'canBeLeashed');
    const controlled = javaMethodOf(className, 'isMobControlled');
    if (
        canBeLeashed?.owner !== 'ZombieHorse' ||
        !canBeLeashed.method.calls.some((call) => call.endsWith('.isTamed')) ||
        !canBeLeashed.method.calls.some((call) => call.endsWith('.isMobControlled')) ||
        !controlled?.method.instructions.some((instruction) => instruction.type === 'net/minecraft/world/entity/Mob')
    )
        return "Java's zombie horse no longer takes a lead by its tameness and its mob rider";
    const differences: string[] = [];
    for (const [tamed, ridden] of [
        [false, false],
        [false, true],
        [true, true]
    ] as const) {
        const java = tamed || !ridden;
        const server = mountTakesLead(
            subject.bedrock,
            tamed ? ['minecraft:horse_tamed'] : [],
            ridden ? 'minecraft:zombie' : undefined
        );
        if (typeof server === 'string') return server;
        if (server !== java)
            differences.push(
                `a ${tamed ? 'tamed' : 'wild'} one ${ridden ? 'a zombie rides' : 'with no rider'} ${server ? 'takes' : 'refuses'} a lead, where Java's ${java ? 'takes' : 'refuses'} one`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/**
 * A camel husk's lead against Java's `CamelHusk.canBeLeashed`: it takes a lead only while no mob
 * rides it (`isMobControlled`), whichever way the rider got on.
 */
const compareCamelHuskLead = (subject: EntitySubject): string | undefined => {
    const className = javaEntityClassName(subject.javaId);
    const canBeLeashed = javaMethodOf(className, 'canBeLeashed');
    const controlled = javaMethodOf(className, 'isMobControlled');
    if (
        canBeLeashed?.owner !== 'CamelHusk' ||
        !canBeLeashed.method.calls.some((call) => call.endsWith('.isMobControlled')) ||
        !controlled?.method.instructions.some((instruction) => instruction.type === 'net/minecraft/world/entity/Mob')
    )
        return "Java's camel husk no longer takes a lead by its mob rider";
    const differences: string[] = [];
    for (const rider of [undefined, 'minecraft:husk'] as const) {
        const java = rider === undefined;
        const server = mountTakesLead(subject.bedrock, [], rider);
        if (typeof server === 'string') return server;
        if (server !== java)
            differences.push(
                `one ${rider === undefined ? 'with no rider' : 'a husk climbed onto'} ${server ? 'takes' : 'refuses'} a lead, where Java's ${java ? 'takes' : 'refuses'} one`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** The push `LivingEntity.dealDefaultKnockback` gives a blow with an attacker, `knockback(0.4F, ...)`, read from the pinned jar. */
const javaBlowKnockback = (): number | undefined => {
    const method = pinnedJavaClass('net/minecraft/world/entity/LivingEntity').find(
        (candidate) => candidate.name === 'dealDefaultKnockback'
    );
    const push = method === undefined ? undefined : numberNear(method, '.knockback', 'before');
    return push === undefined ? undefined : Math.fround(push);
};

/**
 * A drowned's blow on a mob in water against Java's: neither `Drowned` nor `Zombie` overrides
 * the knockback a blow gives, so what it hits is pushed by `LivingEntity.hurtServer`'s 0.4, as
 * by any other blow, and never pulled under.
 */
const compareDrownedKnockback = (subject: EntitySubject): string | undefined => {
    const className = javaEntityClassName(subject.javaId);
    const knockback = javaMethodOf(className, 'knockback');
    if (knockback === undefined || knockback.owner !== 'LivingEntity')
        return `Java's drowned now pushes what it hits by ${knockback?.owner ?? 'nothing'}.knockback`;
    const java = javaBlowKnockback();
    if (java === undefined) return "Java's LivingEntity.dealDefaultKnockback pushes no blow back";
    const pushed = inSandbox(subject.bedrock, 'minecraft:water', (sandbox) => {
        const { runtime } = sandbox.stack;
        const drowned = runtime.bodyOf(sandbox.entity.instance);
        const target = runtime.spawn('minecraft:zombie', { ...SANDBOX_ORIGIN, x: SANDBOX_ORIGIN.x + 1.5 });
        const mob = target === undefined ? undefined : runtime.mobById(target.id);
        if (drowned === undefined || target === undefined || mob === undefined)
            return 'the sandbox could not put a zombie in the water beside it';
        target.body.velocity = { x: 0, y: 0, z: 0 };
        runtime.attack(drowned, mob);
        return {
            velocity: target.body.velocity,
            resistance: target.facts.knockbackResistance,
            landed:
                (target.instance.attributes.get('health')?.current ?? 0) <
                (target.instance.attributes.get('health')?.max ?? 0)
        };
    });
    if (typeof pushed === 'string') return pushed;
    if (!pushed.landed) return 'its blow never landed on the zombie beside it';
    const expected = java * (1 - pushed.resistance);
    const sideways = Math.hypot(pushed.velocity.x, pushed.velocity.z);
    const differences: string[] = [];
    if (Math.abs(sideways - expected) > 0.02)
        differences.push(
            `its blow pushes a zombie in water ${sideways.toFixed(3)} sideways, where Java pushes it ${expected.toFixed(3)}`
        );
    if (pushed.velocity.y < -0.001)
        differences.push(
            `its blow pulls a zombie in water down by ${(-pushed.velocity.y).toFixed(3)}, where Java never does`
        );
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** The archetype a stone block gives a Java sulfur cube, which `#minecraft:sulfur_cube_archetype/slow_bouncy` names. */
const STONE_ARCHETYPE = 'slow_bouncy';

/** A Java sulfur cube archetype's `knockback_modifiers` and the knockback resistance its attribute modifiers add. */
const javaArchetype = (
    archetype: string
): { readonly horizontal: number; readonly vertical: number; readonly resistance: number } | undefined => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'sulfur_cube_archetype', `${archetype}.json`);
    // Parsed JSON boundary: the datapack file is the archetype's registry entry.
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const horizontal = field(field(data, 'knockback_modifiers'), 'horizontal_power');
    const vertical = field(field(data, 'knockback_modifiers'), 'vertical_power');
    const modifiers = field(data, 'attribute_modifiers');
    const added = (Array.isArray(modifiers) ? modifiers : [])
        .filter(
            (modifier) =>
                field(modifier, 'attribute') === 'minecraft:knockback_resistance' &&
                field(modifier, 'operation') === 'add_value'
        )
        .reduce((total: number, modifier) => {
            const amount = field(modifier, 'amount');
            return total + (typeof amount === 'number' ? amount : 0);
        }, 0);
    return typeof horizontal === 'number' && typeof vertical === 'number'
        ? { horizontal, vertical, resistance: added }
        : undefined;
};

/** Whether a datapack item tag lists an item by name. */
const javaItemTagLists = (tag: string, item: string): boolean => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'tags', 'item', `${tag}.json`);
    // Parsed JSON boundary: a datapack tag file.
    const values = field(JSON.parse(readFileSync(path, 'utf-8')), 'values');
    return Array.isArray(values) && values.includes(item);
};

/**
 * The push Java's `SulfurCube.knockback` gives a cube struck by an attacker standing level with
 * it, `distance` away, with its eyes `eyes` up and looking at the cube's center: no turn off the
 * center and none for height, and `applyVerticalHitAnglePowerTransfer` moving power by how far up
 * the cube the look falls, with the result held within the archetype's own powers. A blow of 1
 * scales it by 1.
 */
const javaCubePush = (
    archetype: { readonly horizontal: number; readonly vertical: number },
    height: number,
    eyes: number,
    distance: number,
    resistance: number
): { readonly across: number; readonly up: number } => {
    const towardY = (rise: number): number => rise / Math.hypot(distance, rise);
    const look = towardY(height / 2 - eyes);
    const top = towardY(height - eyes);
    const bottom = towardY(-eyes);
    const share = Math.min(1, Math.max(0, (look - top) / (bottom - top)));
    const transfer = (-1 + 2 * share) * 0.5;
    let across = archetype.horizontal * (1 - transfer);
    let up = archetype.vertical * (1 + transfer);
    const over = Math.max(across / archetype.horizontal, up / archetype.vertical);
    if (over > 1) {
        across /= over;
        up /= over;
    }
    const kept = 1 - resistance;
    return { across: across * kept * 0.4, up: up * kept * 1.2 };
};

/** Java's player eye height, `Player.STANDING_DIMENSIONS.eyeHeight`. */
const PLAYER_EYES = 1.62;

/**
 * A player's blow on a sulfur cube carrying a stone block against Java's `SulfurCube.knockback`,
 * which replaces the plain push with one its archetype's knockback modifiers size, aimed by where
 * the player looks. The pack writes those as the player's `minecraft:apply_knockback_rules`. The
 * cube's box is the server's on both sides, since the client owns hitboxes (category 5 of the
 * parity claim).
 */
const comparePlayerCubeKnockback = (): string | undefined => {
    const cube = pinnedJavaClass('net/minecraft/world/entity/monster/cubemob/SulfurCube').find(
        (method) => method.name === 'knockback'
    );
    if (cube === undefined || !cube.calls.some((call) => call.endsWith('KnockbackModifiers.horizontalPower')))
        return "Java's sulfur cube no longer takes its archetype's knockback";
    const constants = pushedNumbers(cube).map((value) => Math.fround(value));
    if (![1.6, 0.5, 0.8, 0.4, 1.2].every((constant) => constants.includes(Math.fround(constant))))
        return "Java's SulfurCube.knockback no longer scales its push by 1.6, 0.5, 0.8, 0.4 and 1.2";
    if (!javaItemTagLists(`sulfur_cube_archetype/${STONE_ARCHETYPE}`, 'minecraft:stone'))
        return `Java's stone no longer gives a sulfur cube the ${STONE_ARCHETYPE} archetype`;
    const archetype = javaArchetype(STONE_ARCHETYPE);
    const base = loadJavaEntityAttributes()['minecraft:sulfur_cube']?.attributes['minecraft:knockback_resistance'];
    if (archetype === undefined || base === undefined) return `Java's ${STONE_ARCHETYPE} archetype has no knockback`;

    const pushed = withProbe('minecraft:zombie', { keep: [] }, (probe) => {
        const player = probe.player(-1.5, 0, 0);
        const sulfur = probe.spawn('minecraft:sulfur_cube', 3, 0, 0);
        // Bedrock's cube holds what it swallowed in its main hand, and the pickup raises this event.
        sulfur.body.setEquipment({ ...sulfur.body.equipment, mainhand: { identifier: 'minecraft:stone', count: 1 } });
        sulfur.instance.raise('minecraft:on_block_absorbed', 'self', 'parity');
        probe.tick(2);
        const playerAt = probe.at(-1.5, 0, 0);
        sulfur.body.velocity = { x: 0, y: 0, z: 0 };
        probe.runtime.damage({
            target: sulfur.id,
            attacker: player,
            cause: 'entity_attack',
            amount: 1,
            source: { route: 'melee', knockback: { origin: playerAt, levels: 0 } }
        });
        return {
            velocity: sulfur.body.velocity,
            height: sulfur.facts.box.height,
            distance: Math.hypot(sulfur.position.x - playerAt.x, sulfur.position.z - playerAt.z)
        };
    });
    const java = javaCubePush(archetype, pushed.height, PLAYER_EYES, pushed.distance, base + archetype.resistance);
    const across = Math.hypot(pushed.velocity.x, pushed.velocity.z);
    return Math.abs(across - java.across) > 0.005 || Math.abs(pushed.velocity.y - java.up) > 0.005
        ? `a player's blow pushes a sulfur cube carrying stone ${across.toFixed(3)} across and ${pushed.velocity.y.toFixed(3)} up, where Java's SulfurCube.knockback pushes its ${STONE_ARCHETYPE} cube ${java.across.toFixed(3)} across and ${java.up.toFixed(3)} up`
        : undefined;
};

/** The contact damage of a Java sulfur cube archetype, as `data/minecraft/sulfur_cube_archetype` writes it. */
const javaContactDamage = (archetype: string): number | undefined => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'sulfur_cube_archetype', `${archetype}.json`);
    // Parsed JSON boundary: the datapack file is the archetype's registry entry.
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const amount = field(field(data, 'contact_damage'), 'amount');
    return typeof amount === 'number' ? amount : undefined;
};

/**
 * A hot sulfur cube's touch against Java's: `SulfurCube.doPush` hurts what it pushes by its
 * archetype's contact damage, the `hot` archetype's 1.
 */
const compareHotCubeTouch = (subject: EntitySubject): string | undefined => {
    const java = javaContactDamage('hot');
    if (java === undefined) return "Java's hot sulfur cube no longer hurts what it touches";
    const pushes = pinnedJavaClass('net/minecraft/world/entity/monster/cubemob/SulfurCube').find(
        (method) => method.name === 'doPush'
    );
    if (pushes === undefined || !pushes.calls.some((call) => call.endsWith('.applyContactDamage')))
        return "Java's sulfur cube no longer hurts what it pushes";
    const taken = inSandbox(subject.bedrock, 'air', (sandbox) => {
        const { instance } = sandbox.entity;
        const group = 'minecraft:sulfur_cube_hot';
        if (!instance.type.groups.has(group)) return `the server type has no ${group}`;
        instance.restoreComponentGroups([...instance.activeComponentGroups(), group]);
        const victim = sandbox.stack.runtime.spawn('minecraft:zombie', SANDBOX_ORIGIN);
        if (victim === undefined) return 'the sandbox could not put a zombie against it';
        let hurt = 0;
        const before = sandbox.stack.world.commits.length;
        sandbox.tick(5);
        for (const commit of sandbox.stack.world.commits.slice(before))
            if (commit.target.id === victim.id) hurt = Math.max(hurt, commit.taken);
        return hurt;
    });
    if (typeof taken === 'string') return taken;
    return Math.abs(taken - java) < 1e-6
        ? undefined
        : `touching a zombie it takes ${taken} off it, where Java's hot cube takes ${java}`;
};

/** Whether an explosive sulfur cube standing on a block, a redstone block or stone, primes within a few ticks. */
const explosiveCubePrimes = (bedrock: string, ground: string): boolean | string =>
    withProbe(bedrock, { keep: [] }, (probe) => {
        probe.block(0, -1, 0, ground);
        const { instance } = probe.entity;
        instance.raise('minecraft:on_block_absorbed', 'self', 'parity');
        instance.raise('minecraft:become_explosive', 'self', 'parity');
        probe.tick(2);
        if (instance.properties.get('minecraft:sulfur_cube_archetype') !== 'explosive')
            return 'the probe cannot make it an explosive cube';
        probe.tick(5);
        return instance.hasComponent('minecraft:explode');
    });

/**
 * An explosive sulfur cube against Java's `SulfurCube.primeWhenOnPoweredPosition`: it primes
 * itself on a block that redstone powers, `getBestOwnOrNeighbourSignal` above 0, and not elsewhere.
 */
const compareCubePriming = (subject: EntitySubject): string | undefined => {
    const primes = pinnedJavaClass('net/minecraft/world/entity/monster/cubemob/SulfurCube').find(
        (method) => method.name === 'primeWhenOnPoweredPosition'
    );
    if (primes === undefined || !primes.calls.some((call) => /\.getBestOwnOrNeighbou?rSignal$/.test(call)))
        return "Java's sulfur cube no longer primes on a powered block";
    const differences: string[] = [];
    for (const [ground, java] of [
        ['minecraft:redstone_block', true],
        ['minecraft:stone', false]
    ] as const) {
        const server = explosiveCubePrimes(subject.bedrock, ground);
        if (typeof server === 'string') return server;
        if (server !== java)
            differences.push(
                `on ${ground} it ${server ? 'primes' : 'never primes'}, where Java's ${java ? 'primes' : 'stays unprimed'}`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** One keyframed track of `data/minecraft/timeline/day.json`, as the pinned datapack writes it. */
const dayTrack = (attribute: string): readonly { readonly ticks: number; readonly value: unknown }[] => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'timeline', 'day.json');
    // Parsed JSON boundary: the datapack file is the day timeline's registry entry.
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const keyframes = field(field(field(data, 'tracks'), attribute), 'keyframes');
    if (!Array.isArray(keyframes)) return [];
    return keyframes.flatMap((frame) => {
        const ticks = field(frame, 'ticks');
        return typeof ticks === 'number' ? [{ ticks, value: field(frame, 'value') }] : [];
    });
};

/** A boolean timeline track's value at a day time: the last keyframe at or before it, wrapping at midnight. */
const trackOn = (frames: readonly { readonly ticks: number; readonly value: unknown }[], time: number): boolean => {
    const before = frames.filter((frame) => frame.ticks <= time);
    return (before.at(-1) ?? frames.at(-1))?.value === true;
};

/**
 * Java's `Level.isBrightOutside` in clear weather: `getSkyDarken() < 4`, the darkness 15 less the
 * day timeline's `sky_light_level` multiplier of 15, interpolated between keyframes.
 */
const javaBrightOutside = (time: number): boolean => {
    const frames = dayTrack('minecraft:gameplay/sky_light_level').map((frame) => ({
        ticks: frame.ticks,
        value: typeof frame.value === 'number' ? frame.value : 1
    }));
    const extended = [...frames, ...frames.map((frame) => ({ ticks: frame.ticks + 24_000, value: frame.value }))];
    const at = time < (frames[0]?.ticks ?? 0) ? time + 24_000 : time;
    const index = extended.findIndex(
        (frame, position) => frame.ticks <= at && (extended[position + 1]?.ticks ?? Infinity) > at
    );
    const from = extended[index];
    const to = extended[index + 1] ?? from;
    if (from === undefined || to === undefined) return true;
    const multiplier =
        to.ticks === from.ticks
            ? from.value
            : from.value + ((to.value - from.value) * (at - from.ticks)) / (to.ticks - from.ticks);
    return Math.trunc(Math.fround(15 - Math.fround(15 * Math.fround(multiplier)))) < 4;
};

/** The day times the night-window sensors are tried at: each side of every Java and Bedrock edge. */
const NIGHT_PROBE_TIMES = [6_000, 12_100, 12_560, 12_600, 12_700, 18_000, 23_420, 23_470, 23_700] as const;

/** What one entity's night sensor makes of the time of day, and Java's rule for it. */
interface NightSensor {
    /** Java's answer at a day time. */
    readonly java: (time: number) => boolean;
    /** What the answer means, for the difference. */
    readonly meaning: string;
    /** The groups the probe adds, and whether the entity's state now says yes. */
    readonly groups: readonly string[];
    /** The biome tags the probe world carries, when the sensor reads one. */
    readonly biomeTags?: readonly string[];
    readonly server: (instance: EntitySubjectInstance) => boolean;
}

type EntitySubjectInstance = Parameters<NonNullable<Parameters<typeof withProbe>[2]>>[0]['entity']['instance'];

const NIGHT_SENSORS: Readonly<Record<string, NightSensor>> = {
    'minecraft:bee': {
        java: (time) => trackOn(dayTrack('minecraft:gameplay/bees_stay_in_hive'), time),
        meaning: 'heads for its hive',
        groups: [],
        // The pack's bee shelters only in a biome Bedrock tags `overworld`, which the plains are.
        biomeTags: ['minecraft:plains', 'plains', 'overworld'],
        server: (instance) => instance.activeComponentGroups().includes('return_to_home')
    },
    'minecraft:fox': {
        java: (time) => javaBrightOutside(time),
        meaning: 'keeps its daytime nap',
        groups: [],
        server: (instance) => instance.activeComponentGroups().includes('minecraft:fox_day')
    },
    'minecraft:creaking': {
        java: (time) => !trackOn(dayTrack('minecraft:gameplay/creaking_active'), time),
        meaning: 'crumbles away from its heart',
        groups: ['minecraft:spawned_by_creaking_heart'],
        server: (instance) => instance.properties.get('minecraft:creaking_state') === 'crumbling'
    }
};

/**
 * A night sensor against Java's timeline: at each probe time the entity's state follows Java's
 * `bees_stay_in_hive`, `isBrightOutside` or `creaking_active` stretch of the day.
 */
const compareNightSensor = (subject: EntitySubject): string | undefined => {
    const sensor = NIGHT_SENSORS[subject.javaId];
    if (sensor === undefined) return `no Java night rule is recorded for ${subject.javaId}`;
    const differences: string[] = [];
    for (const time of NIGHT_PROBE_TIMES) {
        const java = sensor.java(time);
        const options = {
            keep: [],
            groups: sensor.groups,
            ...(sensor.biomeTags === undefined ? {} : { biomeTags: sensor.biomeTags })
        };
        const server = withProbe(subject.bedrock, options, (probe) => {
            const now = probe.world.world.level.dayTime();
            probe.world.advance((time - now + 24_000) % 24_000);
            probe.tick(3);
            return sensor.server(probe.entity.instance);
        });
        if (server !== java)
            differences.push(
                `at day time ${time} it ${server ? '' : 'never '}${sensor.meaning}, where Java's ${java ? 'does' : 'does not'}`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/**
 * A villager near a rung bell against Java's: `BellBlockEntity.updateEntities` writes
 * `HEARD_BELL_TIME` into every living entity within 32 blocks of the bell, `ReactToBell` turns the
 * villager's brain to `hide`, and `LocateHidingPlace` runs it to a bed within its search range.
 */
const compareBellHiding = (subject: EntitySubject): string | undefined => {
    const bell = pinnedJavaClass('net/minecraft/world/level/block/entity/BellBlockEntity').find(
        (method) => method.name === 'updateEntities'
    );
    const range = bell === undefined ? undefined : numberNear(bell, '.closerToCenterThan', 'before');
    if (range === undefined) return "Java's bell no longer tells the entities around it that it rang";
    const outcome = withProbe(subject.bedrock, { keep: [] }, (probe) => {
        probe.block(6, 0, 0, 'minecraft:bed', { head_piece_bit: true, direction: 0, occupied_bit: false });
        const far = probe.spawn(subject.bedrock, range + 8, 0, 0);
        probe.runtime.ringBell(probe.at(-2, 0, 0));
        probe.tick(2);
        const place = probe.entity.brain?.getMemory(MemoryModuleTypes.HIDING_PLACE)?.pos;
        const bed = probe.at(6, 0, 0);
        return {
            hiding: probe.entity.brain?.isActive(Activities.HIDE) === true,
            farHiding: far.brain?.isActive(Activities.HIDE) === true,
            hidesInBed:
                place !== undefined &&
                place.x === Math.floor(bed.x) &&
                place.y === Math.floor(bed.y) &&
                place.z === Math.floor(bed.z)
        };
    });
    const differences: string[] = [];
    if (!outcome.hiding) differences.push('a villager beside a rung bell never turns to hide, where Java hides it');
    if (outcome.farHiding)
        differences.push(
            `a villager ${range + 8} blocks from the bell hides too, where Java's hears it only within ${range}`
        );
    if (outcome.hiding && !outcome.hidesInBed)
        differences.push(
            'a hiding villager picks no hiding place at the bed beside it, where Java runs it to that bed'
        );
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** The runtime id of the store player a ravager strikes. */
const SHIELD_HOLDER_ID = 9_800_001;

/** What a ravager's blow on a player behind a raised shield did, with one draw of the world's random source. */
interface BlockedRavager {
    /** The health the player lost. */
    readonly taken: number;
    /** How many ticks the ravager stayed stunned, or undefined when it never was. */
    readonly stunnedTicks: number | undefined;
    /** The push the player was sent, or undefined when it was sent none. */
    readonly impulse: EntityPosition | undefined;
    /** How far the player stood from the ravager, horizontally. */
    readonly distance: number;
}

/**
 * Strikes a player who faces the ravager with a shield raised in the off hand, sneaking for 10
 * ticks, past the shield's quarter-second block delay, with `draw` as every random draw after.
 */
const ravagerOnShield = (bedrock: string, draw: number): BlockedRavager | string =>
    withProbe(bedrock, { keep: [] }, (probe) => {
        const player = probe.runtime.spawnPlayer(SHIELD_HOLDER_ID, probe.at(1.5, 0, 0));
        const target = probe.runtime.mobById(SHIELD_HOLDER_ID);
        if (player === undefined || target === undefined) return 'the probe could not put a player in front of it';
        try {
            player.body.setEquipment({ offhand: { identifier: 'minecraft:shield', count: 1 } });
            // Facing -x, toward the ravager: Java's look is (-sin(yaw), cos(yaw)).
            player.body.yaw = 90;
            const impulses: EntityPosition[] = [];
            const send = player.body.onImpulse;
            player.body.onImpulse = (impulse) => {
                impulses.push(impulse);
                send?.(impulse);
            };
            probe.runtime.playerSystems.setSneaking(player, true);
            probe.tick(10);
            const ravager = probe.runtime.bodyOf(probe.entity.instance);
            if (ravager === undefined) return 'the probe lost the ravager';
            probe.reroll([draw]);
            const before = player.instance.attributes.get('health')?.current ?? 0;
            probe.runtime.attack(ravager, target);
            const taken = before - (player.instance.attributes.get('health')?.current ?? 0);
            const distance = Math.hypot(player.position.x - ravager.position.x, player.position.z - ravager.position.z);
            probe.tick(1);
            const { instance } = probe.entity;
            const stunned = instance.hasComponent('minecraft:is_stunned');
            const stunnedTicks = stunned
                ? probe.until(() => !instance.hasComponent('minecraft:is_stunned'), 200)
                : undefined;
            return {
                taken,
                stunnedTicks: stunnedTicks === undefined ? undefined : stunnedTicks + 1,
                impulse: impulses[0],
                distance
            };
        } finally {
            probe.runtime.remove(player.id, 'parity probe');
        }
    });

/**
 * A ravager's blow on a player behind a raised shield against Java's: the shield blocks it whole
 * (`LivingEntity.applyItemBlocking`), and `Ravager.blockedByItem` either stuns the ravager for 40
 * ticks, for a draw under 0.5, or throws the defender back by `strongKnockback`, 4 over the
 * distance and 0.2 up.
 */
const compareRavagerBlocked = (subject: EntitySubject): string | undefined => {
    const className = javaEntityClassName(subject.javaId);
    const blocked = javaMethodOf(className, 'blockedByItem');
    const stun = blocked === undefined ? [] : pushedNumbers(blocked.method);
    const thrown = javaMethodOf(className, 'strongKnockback');
    const throws = thrown === undefined ? [] : pushedNumbers(thrown.method);
    if (blocked?.owner !== 'Ravager' || !stun.includes(40) || !stun.includes(0.5))
        return "Java's ravager is no longer stunned by a shield half the time";
    if (!throws.includes(4) || !throws.includes(0.2))
        return "Java's ravager no longer throws a blocker 4 across and 0.2 up";
    const differences: string[] = [];
    for (const draw of [0.25, 0.75]) {
        const outcome = ravagerOnShield(subject.bedrock, draw);
        if (typeof outcome === 'string') return outcome;
        if (outcome.taken > 0) {
            differences.push(
                `a player facing it behind a raised shield takes ${outcome.taken} from its blow, where Java's shield blocks it whole`
            );
            break;
        }
        if (draw < 0.5) {
            if (outcome.stunnedTicks === undefined || Math.abs(outcome.stunnedTicks - 40) > 1)
                differences.push(
                    `with a draw of ${draw} it is stunned for ${outcome.stunnedTicks ?? 0} ticks, where Java's is stunned for 40`
                );
            continue;
        }
        const across = 4 / Math.max(outcome.distance, Math.sqrt(0.001));
        const impulse = outcome.impulse;
        if (
            outcome.stunnedTicks !== undefined ||
            impulse === undefined ||
            Math.abs(Math.hypot(impulse.x, impulse.z) - across) > 0.01 ||
            Math.abs(impulse.y - 0.2) > 0.01
        )
            differences.push(
                `with a draw of ${draw} it throws the player ${impulse === undefined ? 'nowhere' : `${Math.hypot(impulse.x, impulse.z).toFixed(3)} across and ${impulse.y.toFixed(3)} up`}${outcome.stunnedTicks === undefined ? '' : ' and is stunned'}, where Java's throws it ${across.toFixed(3)} across and 0.2 up`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/**
 * Whether Java's `LivingEntity.hurtServer` meets a blow with the shield before the grace period:
 * it calls `applyItemBlocking` before it first reads `damageCooldownTime`.
 */
const javaBlocksBeforeGrace = (): boolean => {
    const method = javaMethodOf('net/minecraft/world/entity/LivingEntity', 'hurtServer');
    if (method === undefined) return false;
    const operations = javaOperations(method.method);
    const blocking = operations.findIndex(
        (operation) => operation.kind === 'call' && operation.target === 'LivingEntity.applyItemBlocking'
    );
    const grace = operations.findIndex(
        (operation) =>
            operation.kind === 'field' && !operation.write && operation.target === 'LivingEntity.damageCooldownTime'
    );
    return blocking >= 0 && grace > blocking;
};

/**
 * An axe blow against a raised shield inside the grace period of an earlier blow the shield took.
 * Java meets it with the shield first, so the axe disables the shield even though the grace period then turns
 * the blow away, and a blow 20 ticks later lands. Answers what that later blow took.
 */
const axeInGrace = (bedrock: string): number | string =>
    withProbe(bedrock, { keep: [] }, (probe) => {
        const player = probe.runtime.spawnPlayer(SHIELD_HOLDER_ID, probe.at(1.5, 0, 0));
        const target = probe.runtime.mobById(SHIELD_HOLDER_ID);
        if (player === undefined || target === undefined) return 'the probe could not put a player in front of it';
        try {
            player.body.setEquipment({ offhand: { identifier: 'minecraft:shield', count: 1 } });
            player.body.yaw = 90;
            probe.runtime.playerSystems.setSneaking(player, true);
            probe.tick(10);
            const attacker = probe.runtime.bodyOf(probe.entity.instance);
            if (attacker === undefined) return 'the probe lost the attacker';
            // A bare-handed blow the shield takes whole starts the grace period, then the axe
            // `Vindicator.populateDefaultEquipmentSlots` gives it strikes inside it.
            attacker.setEquipment({});
            probe.runtime.attack(attacker, target);
            attacker.setEquipment({ mainhand: { identifier: 'minecraft:iron_axe', count: 1 } });
            probe.runtime.attack(attacker, target);
            probe.tick(20);
            const before = player.instance.attributes.get('health')?.current ?? 0;
            probe.runtime.attack(attacker, target);
            return before - (player.instance.attributes.get('health')?.current ?? 0);
        } finally {
            probe.runtime.remove(player.id, 'parity probe');
        }
    });

/** A vindicator's axe inside the grace period against Java's: it disables the shield all the same. */
const compareAxeInGrace = (subject: EntitySubject): string | undefined => {
    if (!javaBlocksBeforeGrace())
        return "Java's LivingEntity.hurtServer no longer runs applyItemBlocking before its grace check";
    const taken = axeInGrace(subject.bedrock);
    if (typeof taken === 'string') return taken;
    return taken > 0
        ? undefined
        : "an axe blow inside the grace period of an earlier hit leaves a raised shield up, so the next blow 20 ticks later is blocked, where Java's hurtServer meets the axe with the shield first and disables it for 100 ticks";
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
    },
    {
        name: 'riding-enderman-stays',
        java: "An enderman riding something never teleports, since Java's Enderman.teleport(x, y, z) refuses a passenger; the pack's riding sensor takes its teleport away for the ride.",
        reference: 'Java Enderman.teleport(DDD) (isPassenger) and repeatedlyTryToTeleport, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter(
                (subject) => subject.javaId === 'minecraft:enderman'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: compareEndermanRiding
    },
    {
        name: 'freed-trader-llama-stays-wild',
        java: "A trader llama off its trader's lead stays wild for a player to tame, since Java's TraderLlama never tames itself.",
        reference:
            'Java TraderLlama (maybeDespawn, canDespawn, doPlayerRide) and WanderingTraderSpawner.tryToSpawnLlamaFor (setLeashedTo), which never call setTamed, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter(
                (subject) => subject.javaId === 'minecraft:trader_llama'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: compareFreedTraderLlama
    },
    {
        name: 'zombie-horse-lead',
        java: "A zombie horse takes a lead when it is tamed or when no mob rides it, as Java's ZombieHorse.canBeLeashed decides.",
        reference:
            'Java ZombieHorse.canBeLeashed (isTamed, isMobControlled: getFirstPassenger instanceof Mob), read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter(
                (subject) => subject.javaId === 'minecraft:zombie_horse'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: compareZombieHorseLead
    },
    {
        name: 'camel-husk-lead',
        java: "A camel husk takes a lead only while no mob rides it, as Java's CamelHusk.canBeLeashed decides.",
        reference:
            'Java CamelHusk.canBeLeashed and isMobControlled (getFirstPassenger instanceof Mob), read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter(
                (subject) => subject.javaId === 'minecraft:camel_husk'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: compareCamelHuskLead
    },
    {
        name: 'drowned-blow-knockback',
        java: "A drowned's blow pushes a target in water as any blow of its size does, since Java's Drowned keeps LivingEntity.knockback.",
        reference:
            'Java Drowned, Zombie and Mob.doHurtTarget, LivingEntity.dealDefaultKnockback (knockback(0.4F)) and LivingEntity.knockback, read from the pinned jar; issue #3221',
        subjects: () =>
            entitiesDeclaring('minecraft:apply_knockback_rules').filter(
                (subject) => subject.javaId === 'minecraft:drowned'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:apply_knockback_rules'],
        run: compareDrownedKnockback
    },
    {
        name: 'player-blow-on-sulfur-cube',
        java: "A player's blow on a sulfur cube carrying a block pushes it by the cube's archetype knockback, as Java's SulfurCube.knockback replaces the plain push.",
        reference:
            'Java SulfurCube.knockback (hasBodyItem, SulfurCubeArchetype$KnockbackModifiers horizontalPower and verticalPower, applyHorizontalHitAngleScale, applyVerticalHitAnglePowerTransfer, applyVerticalPositionAnglePowerRotation, 0.4 and 1.2), read from the pinned jar, and data/minecraft/sulfur_cube_archetype/slow_bouncy.json with #minecraft:sulfur_cube_archetype/slow_bouncy',
        subjects: () =>
            entitiesDeclaring('minecraft:apply_knockback_rules').filter(
                (subject) => subject.javaId === 'minecraft:player'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:apply_knockback_rules'],
        run: comparePlayerCubeKnockback
    },
    {
        name: 'hot-sulfur-cube-touch',
        java: "A hot sulfur cube hurts a mob it pushes by its archetype's contact damage, 1, as Java's SulfurCube.doPush does.",
        reference:
            'Java SulfurCube.doPush and applyContactDamage (SulfurCubeArchetype$ContactDamage amount and damage type), and data/minecraft/sulfur_cube_archetype/hot.json, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:area_attack').filter((subject) => subject.javaId === 'minecraft:sulfur_cube'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:area_attack'],
        run: compareHotCubeTouch
    },
    {
        name: 'explosive-cube-primes-on-power',
        java: "An explosive sulfur cube primes itself on a block redstone powers, as Java's SulfurCube.primeWhenOnPoweredPosition does every tick.",
        reference:
            'Java SulfurCube.tick, primeWhenOnPoweredPosition (canExplode, the best own or neighbor signal SignalGetter reads) and primeTime (TNT_EXPLODES), read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter(
                (subject) => subject.javaId === 'minecraft:sulfur_cube'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: compareCubePriming
    },
    {
        name: 'night-window-sensors',
        java: "A bee heads home through Java's bees_stay_in_hive stretch of the night, a fox naps while Java's level is bright outside, and a heart's creaking crumbles outside Java's creaking_active night.",
        reference:
            'Java Bee.wantsToEnterHive (BEES_STAY_IN_HIVE), Fox.canSleep (Level.isBrightOutside: getSkyDarken() < 4) and CreakingHeartBlock.isNaturalNight (CREAKING_ACTIVE), with the tracks of data/minecraft/timeline/day.json, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:environment_sensor').filter((subject) => subject.javaId in NIGHT_SENSORS),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor'],
        run: compareNightSensor
    },
    {
        name: 'villager-hides-on-bell',
        java: "A villager within 32 blocks of a rung bell turns to hide and picks the bed nearby to run to, as Java's BellBlockEntity, ReactToBell and LocateHidingPlace have it.",
        reference:
            'Java BellBlockEntity.updateEntities (closerToCenterThan(32), HEARD_BELL_TIME), VillagerGoalPackages.getCorePackage (ReactToBell) and getHidePackage (SetHiddenState, LocateHidingPlace), read from the pinned jar; issue #3198',
        subjects: () =>
            entitiesDeclaring('minecraft:hide').filter((subject) => subject.javaId === 'minecraft:villager'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            ['minecraft:hide', 'minecraft:behavior.hide'].filter((component) =>
                serverContent().entities.registry.get(subject.bedrock)?.declaredComponents.includes(component)
            ),
        run: compareBellHiding
    },
    {
        name: 'ravager-blocked-by-shield',
        java: "A ravager whose blow a raised shield blocks is stunned for 40 ticks half the time and throws the defender back otherwise, as Java's Ravager.blockedByItem does.",
        reference:
            'Java LivingEntity.applyItemBlocking, Ravager.blockedByItem (roarTick, nextDouble() < 0.5, stunnedTick 40) and Ravager.strongKnockback (4 over the squared distance, 0.2 up), read from the pinned jar',
        subjects: () => entitiesDeclaring('minecraft:ravager_blocked'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:ravager_blocked'],
        run: compareRavagerBlocked
    },
    {
        name: 'shield-disabled-in-grace',
        java: "An axe blow on a raised shield inside the grace period of an earlier hit still disables the shield, because Java's LivingEntity.hurtServer runs applyItemBlocking before its grace check.",
        reference:
            'Java LivingEntity.hurtServer (applyItemBlocking before damageCooldownTime) and Player.blockUsingItem, read from the pinned jar',
        subjects: () => ['minecraft:vindicator'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:shield'],
        run: compareAxeInGrace
    }
];
