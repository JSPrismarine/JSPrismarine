import { FLOOR_Y } from '@jsprismarine/prismarine/entity/data/testing';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { stage, tickStage } from './stage.ts';
import type { StagedEntity } from './stage.ts';
import type { EntitySubject } from './subjects.ts';
import { mappedEntity } from './subjects.ts';

/**
 * The engine entities: the ones Bedrock runs from engine code rather than from a definition,
 * which the server either carries a built-in definition for or does not run at all.
 */

/** One blow the stage saw land on an entity. */
interface StageBlow {
    readonly tick: number;
    readonly target: number;
    readonly cause: string;
    readonly amount: number;
    readonly attacker: number | undefined;
}

/**
 * Ticks the stage `ticks` times and reports every blow and the first tick `watched` was gone.
 *
 * @param hold - Runs before each tick, to keep a target where the scenario put it.
 */
const run = (
    ticks: number,
    watched: number,
    hold: () => void = () => undefined
): { readonly blows: readonly StageBlow[]; readonly goneAt: number | undefined } => {
    const { runtime, world } = stage();
    const blows: StageBlow[] = [];
    let goneAt: number | undefined;
    let read = world.commits.length;
    for (let tick = 1; tick <= ticks; tick += 1) {
        hold();
        tickStage();
        for (const commit of world.commits.slice(read))
            blows.push({
                tick,
                target: commit.target.id,
                cause: commit.intent.cause,
                amount: commit.intent.amount,
                attacker: commit.intent.attacker
            });
        read = world.commits.length;
        if (goneAt === undefined && runtime.byId(watched) === undefined) goneAt = tick;
    }
    return { blows, goneAt };
};

/** Removes whatever a scenario spawned and is still standing. */
const clear = (...entities: readonly (StagedEntity | undefined)[]): void => {
    const { runtime } = stage();
    for (const entity of entities)
        if (entity !== undefined && runtime.byId(entity.id) !== undefined)
            runtime.remove(entity.id, 'parity scenario complete');
};

/** Java's `FallingBlockEntity` numbers: gravity before the move, drag after it. */
const FALLING = { gravity: 0.04, drag: 0.98 } as const;

/**
 * Where Java's falling block stands after each tick of a drop from rest at `startY` onto a floor
 * whose top is `floorTop`, until the tick it lands, which is the last entry.
 */
const javaFall = (startY: number, floorTop: number): readonly number[] => {
    const heights: number[] = [];
    let y = startY;
    let velocity = 0;
    for (let tick = 0; tick < 600; tick += 1) {
        velocity -= FALLING.gravity;
        if (y + velocity <= floorTop) {
            heights.push(floorTop);
            return heights;
        }
        y += velocity;
        heights.push(y);
        velocity *= FALLING.drag;
    }
    return heights;
};

/** A column on the stage's floor no other scenario uses, by its x. */
const column = (x: number): { readonly x: number; readonly z: number } => ({ x: 3200 + x, z: 0 });

/** The falling block scenario's checks, each a sentence when the server differs. */
const fallingBlockDifferences = (bedrock: string): readonly string[] => {
    const { runtime, world } = stage();
    const differences: string[] = [];
    const floorTop = FLOOR_Y + 1;

    // A drop of sand onto the stone floor: Java's trajectory, tick for tick, and the block it becomes.
    {
        const { x, z } = column(0);
        const startY = floorTop + 10;
        const sand = runtime.spawn(
            bedrock,
            { x: x + 0.5, y: startY, z: z + 0.5 },
            { data: { block: 'minecraft:sand' } }
        );
        if (sand === undefined) return [`the server would not spawn ${bedrock} with a block of sand`];
        const java = javaFall(startY, floorTop);
        const server: number[] = [];
        for (let tick = 0; tick < java.length + 5 && runtime.byId(sand.id) !== undefined; tick += 1) {
            tickStage();
            if (runtime.byId(sand.id) !== undefined) server.push(sand.position.y);
        }
        clear(sand);
        const flight = java.slice(0, -1);
        const drift = flight.findIndex((height, tick) => Math.abs((server[tick] ?? Number.NaN) - height) > 1e-9);
        if (drift >= 0)
            differences.push(
                `after ${drift + 1} ticks of falling it stands at ${String(server[drift])}, where Java's stands at ${flight[drift]}`
            );
        else if (server.length !== flight.length)
            differences.push(`it lands after ${server.length + 1} ticks, where Java's lands after ${java.length}`);
        const placed = world.world.blocks.get({ x, y: floorTop, z })?.identifier;
        if (placed !== 'minecraft:sand') differences.push(`it lands as ${String(placed)}, where Java's lands as sand`);
    }

    // Onto a torch, which Java's `minecraft:replaceable` tag does not hold: the sand breaks into
    // its item and the torch stays.
    {
        const { x, z } = column(2);
        world.setBlock({ x, y: floorTop, z }, 'minecraft:torch');
        const drops = world.drops.length;
        const sand = runtime.spawn(
            bedrock,
            { x: x + 0.5, y: floorTop + 3, z: z + 0.5 },
            { data: { block: 'minecraft:sand' } }
        );
        run(40, sand?.id ?? -1);
        clear(sand);
        const left = world.world.blocks.get({ x, y: floorTop, z })?.identifier;
        const dropped = world.drops.slice(drops).map((drop) => drop.item.identifier);
        if (left !== 'minecraft:torch' || !dropped.includes('minecraft:sand'))
            differences.push(
                `sand landing on a torch leaves ${String(left)} and drops ${dropped.join(', ') || 'nothing'}, where Java's leaves the torch and drops the sand`
            );
    }

    // An anvil dropped five blocks onto a pig: `AnvilBlock.falling` sets 2 per block fallen past
    // the first, at most 40, so the pig takes 8.
    {
        const { x, z } = column(4);
        const at = { x: x + 0.5, y: floorTop, z: z + 0.5 };
        const pig = runtime.spawn('minecraft:pig', at);
        const anvil = runtime.spawn(bedrock, { ...at, y: floorTop + 5 }, { data: { block: 'minecraft:anvil' } });
        const { blows } = run(40, anvil?.id ?? -1, () => {
            if (pig !== undefined) pig.body.position = at;
        });
        clear(pig, anvil);
        const onPig = blows.filter((blow) => blow.target === pig?.id);
        if (onPig.length !== 1 || onPig[0]?.amount !== 8 || onPig[0]?.cause !== 'anvil')
            differences.push(
                `an anvil falling five blocks onto a pig deals ${onPig.map((blow) => `${blow.amount} ${blow.cause}`).join(', ') || 'nothing'}, where Java's deals 8 anvil damage`
            );
    }

    return differences;
};

/** What Java's fangs do to a pig standing on them, cast by an evoker standing there too. */
const fangsDifferences = (bedrock: string): readonly string[] => {
    const { runtime } = stage();
    const { x, z } = column(8);
    const at = { x: x + 0.5, y: FLOOR_Y + 1, z: z + 0.5 };
    const evoker = runtime.spawn('minecraft:evocation_illager', at);
    const pig = runtime.spawn('minecraft:pig', at);
    const fangs = runtime.spawn(bedrock, at, evoker === undefined ? {} : { ownerId: evoker.id });
    if (fangs === undefined || pig === undefined || evoker === undefined) {
        clear(evoker, pig, fangs);
        return [`the server would not spawn ${bedrock}`];
    }
    const { blows, goneAt } = run(30, fangs.id, () => {
        pig.body.position = at;
        evoker.body.position = at;
    });
    clear(evoker, pig, fangs);

    const differences: string[] = [];
    const bites = blows.filter((blow) => blow.target === pig.id);
    const [bite] = bites;
    if (
        bites.length !== 1 ||
        bite?.tick !== 8 ||
        bite.amount !== 6 ||
        bite.cause !== 'magic' ||
        bite.attacker !== evoker.id
    )
        differences.push(
            `the pig takes ${bites.map((blow) => `${blow.amount} ${blow.cause} at tick ${blow.tick}`).join(', ') || 'nothing'}, where Java's fangs bite it once, for 6 magic damage from the evoker, at tick 8`
        );
    if (blows.some((blow) => blow.target === evoker.id)) differences.push('the fangs bite the evoker that cast them');
    if (goneAt !== 23) differences.push(`the fangs leave at tick ${String(goneAt)}, where Java's leave at tick 23`);
    return differences;
};

/**
 * How long a hanging entity may stand without its support before Java checks: `HangingEntity.tick`
 * runs `survives` every 100 ticks.
 */
const HANGING_CHECK_TICKS = 100;

/** A painting or leash knot whose support goes: Java's breaks within one check, and a painting drops its item. */
const hangingDifferences = (javaId: string, bedrock: string): readonly string[] => {
    const { runtime, world } = stage();
    const { x, z } = column(javaId === 'minecraft:painting' ? 12 : 14);
    const support = { x, y: FLOOR_Y + 2, z };
    world.setBlock(support, javaId === 'minecraft:painting' ? 'minecraft:stone' : 'minecraft:oak_fence');
    const at = { x: x + 0.5, y: FLOOR_Y + 2, z: javaId === 'minecraft:painting' ? z + 1.03 : z + 0.5 };
    const hanging = runtime.spawn(bedrock, at);
    if (hanging === undefined) return [`the server would not spawn ${bedrock}, so nothing hangs`];

    const drops = world.drops.length;
    world.setBlock(support, 'minecraft:air');
    const { goneAt } = run(HANGING_CHECK_TICKS + 1, hanging.id);
    clear(hanging);
    const dropped = world.drops.slice(drops).map((drop) => drop.item.identifier);
    const differences: string[] = [];
    if (goneAt === undefined)
        differences.push(
            `it hangs on for ${HANGING_CHECK_TICKS + 1} ticks with nothing to hang from, where Java's breaks`
        );
    if (javaId === 'minecraft:painting' && !dropped.includes('minecraft:painting'))
        differences.push(`it drops ${dropped.join(', ') || 'nothing'}, where Java's drops a painting`);
    return differences;
};

/** Java's `OminousItemSpawner` lets its item go within 120 ticks and is gone. */
const OMINOUS_SPAWN_TICKS = 120;

/** An ominous item spawner holding an arrow: Java's releases the arrow and leaves. */
const ominousDifferences = (bedrock: string): readonly string[] => {
    const { runtime } = stage();
    const { x, z } = column(16);
    const spawner = runtime.spawn(
        bedrock,
        { x: x + 0.5, y: FLOOR_Y + 4, z: z + 0.5 },
        { data: { item: { name: 'minecraft:arrow', count: 1 } } }
    );
    if (spawner === undefined) return [`the server would not spawn ${bedrock}`];
    const before = new Set([...runtime.entities()].map((entity) => entity.id));
    const { goneAt } = run(OMINOUS_SPAWN_TICKS + 1, spawner.id);
    const released = [...runtime.entities()].filter((entity) => !before.has(entity.id));
    clear(spawner, ...released);
    if (goneAt === undefined || released.length === 0)
        return [
            `it holds its arrow for ${OMINOUS_SPAWN_TICKS + 1} ticks and stays, where Java's lets the item go within ${OMINOUS_SPAWN_TICKS} and leaves`
        ];
    return [];
};

/** The engine entities, each against the Java class that runs it. */
export const engineScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'falling-block',
        java: "A falling block falls by Java's gravity and drag, takes the place of a replaceable block it lands in or breaks into its item, and an anvil hurts what it lands on.",
        reference:
            'Java FallingBlockEntity.tick (gravity 0.04 before the move, drag 0.98 after), FallingBlockEntity.causeFallDamage, BlockState.canBeReplaced (the minecraft:replaceable tag) and AnvilBlock.falling (setHurtsEntities 2, 40)',
        subjects: () => ['minecraft:falling_block'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:falling_block'],
        run: (subject) => {
            const differences = fallingBlockDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'evoker-fangs',
        java: 'Evoker fangs bite every living thing on them but their evoker once, for 6, eight ticks after they rise, and are gone at tick 23.',
        reference:
            'Java EvokerFangs.tick (warmupDelay, the bite at -8, lifeTicks 22) and EvokerFangs.dealDamageTo (6 indirect magic damage, sparing the owner and its allies)',
        subjects: () => ['minecraft:evoker_fangs'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:evoker_fangs'],
        run: (subject) => {
            const differences = fangsDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'hanging-entity-support',
        java: 'A painting or a leash knot breaks once what it hangs from is gone, and a painting drops its item.',
        reference:
            'Java HangingEntity.tick (survives checked every 100 ticks), Painting.dropItem and LeashFenceKnotEntity.survives; issue #3136',
        subjects: () => ['minecraft:painting', 'minecraft:leash_knot'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['engine'],
        run: (subject) => {
            const differences = hangingDifferences(subject.javaId, subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'ominous-item-spawner',
        java: 'An ominous item spawner lets its item go within 120 ticks and leaves.',
        reference:
            'Java OminousItemSpawner.tick (spawnItemAfterTicks drawn from 60 to 120) and OminousItemSpawner.spawnItem; issue #3137',
        subjects: () => ['minecraft:ominous_item_spawner'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['engine'],
        run: (subject) => {
            const differences = ominousDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
