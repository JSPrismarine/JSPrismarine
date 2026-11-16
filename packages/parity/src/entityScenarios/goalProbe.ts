import { buildServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import type { ServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import type { ContentEntity } from '@jsprismarine/prismarine/content/world/adapter';
import { singleDimension } from '@jsprismarine/prismarine/content/world/adapter';
import { entityContentGroups } from '@jsprismarine/prismarine/entity/contentAdapter';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { FLOOR_Y, TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';
import type { EntityPosition } from '@jsprismarine/entities';

/**
 * A private server stack for the mob goal scenarios: the fetched content, a live entity runtime
 * and a flat stone test world, wired the way `buildServerContent` wires the server's own.
 *
 * It is separate from `realStack` so a scenario can script the world's random draws and leave
 * blocks behind without another theme reading them. Each probe runs in its own patch of the
 * world, far from every other, and removes what it spawned.
 */

/** A live entity in the runtime, as `EntityRuntime.spawn` hands one back. */
export type DataEntity = NonNullable<ReturnType<EntityRuntime['spawn']>>;

/** The values the world's random source replays, which a probe rewrites before it ticks. */
const draws: number[] = [0.5];

interface GoalStack {
    readonly content: ServerContent;
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
    readonly reports: string[];
}

let built: GoalStack | undefined;

const goalStack = (): GoalStack => {
    if (built !== undefined) return built;
    const world = new TestEntityWorld({ random: draws });
    const reports: string[] = [];
    let content: ServerContent | undefined;
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the entity runtime was read before the content build finished');
            return content;
        },
        world: world.world,
        host: world.host,
        report: (message) => reports.push(message)
    });
    content = buildServerContent({
        world: singleDimension({ ...world.world, ticks: world.ticks, ...entityContentGroups(runtime) })
    });
    built = { content, runtime, world, reports };
    return built;
};

/** The y of the first air block above the test world's stone floor. */
export const GROUND_Y = FLOOR_Y + 1;

/** How far apart two probes' patches of the world are, in blocks. */
const PATCH = 512;

let patches = 0;
let clock = 0;

/** What a probe is asked to set up. */
export interface ProbeOptions {
    /** Component groups to add on top of the ones the entity spawns with. */
    readonly groups?: readonly string[];
    /** Component groups to take off first, such as the size a slime drew at spawn. */
    readonly without?: (group: string) => boolean;
    /** Goals to leave scheduled; every other goal is taken off. Absent keeps every goal. */
    readonly keep?: readonly string[];
    /** The world's random draws while the probe runs, replayed in a loop. */
    readonly random?: readonly number[];
}

/** One entity in its own patch of the private stack, and the means to drive it. */
export interface Probe {
    readonly entity: DataEntity;
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
    /** A position relative to the probe's patch origin, which stands on the floor at `y` 0. */
    readonly at: (x: number, y: number, z: number) => EntityPosition;
    /** Places a block relative to the patch origin, where `y` 0 is the first air layer. */
    readonly block: (x: number, y: number, z: number, identifier: string) => void;
    /** Fills a box of blocks relative to the patch origin, corners included. */
    readonly fill: (
        from: readonly [number, number, number],
        to: readonly [number, number, number],
        identifier: string
    ) => void;
    /** The block relative to the patch origin. */
    readonly blockAt: (x: number, y: number, z: number) => string | undefined;
    /** Puts a player in the world relative to the patch origin, and returns its runtime id. */
    readonly player: (x: number, y: number, z: number) => number;
    /** Spawns another entity relative to the patch origin, which the probe removes with its own. */
    readonly spawn: (identifier: string, x: number, y: number, z: number) => DataEntity;
    /** Runs the runtime for some ticks, advancing the world's clocks with it. */
    readonly tick: (count?: number) => void;
    /** Runs ticks until the predicate holds, and returns how many ran, or undefined when it never did. */
    readonly until: (predicate: () => boolean, limit: number) => number | undefined;
}

/**
 * Runs a scenario body against one freshly spawned entity, and cleans up after it.
 *
 * The entity's goals other than `keep` are taken off its scheduler, so the goal under test runs
 * alone with the entity's own parameters, its real component set and the server's real goal
 * world behind it.
 * @param bedrock - The entity type to spawn.
 * @param options - What to set up.
 * @param body - The scenario, which returns what differed from Java.
 * @returns What the body returned.
 */
export const withProbe = <T>(bedrock: string, options: ProbeOptions, body: (probe: Probe) => T): T => {
    const { runtime, world, content } = goalStack();
    patches += 1;
    const origin = { x: patches * PATCH + 0.5, y: GROUND_Y, z: 0.5 };
    const at = (x: number, y: number, z: number): EntityPosition => ({
        x: origin.x + x,
        y: origin.y + y,
        z: origin.z + z
    });
    const cell = (x: number, y: number, z: number): EntityPosition => {
        const where = at(x, y, z);
        return { x: Math.floor(where.x), y: Math.floor(where.y), z: Math.floor(where.z) };
    };
    draws.splice(0, draws.length, ...(options.random ?? [0.5]));

    const spawned: DataEntity[] = [];
    const players: ContentEntity[] = [];
    const entity = runtime.spawn(bedrock, origin);
    if (entity === undefined) throw new Error(`the server could not spawn ${bedrock}`);
    spawned.push(entity);
    if (options.without !== undefined || (options.groups !== undefined && options.groups.length > 0)) {
        const declared = content.entities.registry.get(bedrock);
        for (const group of options.groups ?? [])
            if (declared?.groups.has(group) !== true) throw new Error(`${bedrock} declares no group ${group}`);
        const kept = entity.instance.activeComponentGroups().filter((group) => options.without?.(group) !== true);
        entity.instance.restoreComponentGroups([...kept, ...(options.groups ?? [])]);
    }
    if (options.keep !== undefined) {
        for (const name of entity.instance.goals.names())
            if (!options.keep.includes(name)) entity.instance.goals.remove(name);
    }

    let nextPlayer = 9_000_000 + patches * 16;
    const probe: Probe = {
        entity,
        runtime,
        world,
        at,
        block: (x, y, z, identifier) => world.setBlock(cell(x, y, z), identifier),
        fill: (from, to, identifier) => {
            for (let x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x += 1)
                for (let y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y += 1)
                    for (let z = Math.min(from[2], to[2]); z <= Math.max(from[2], to[2]); z += 1)
                        world.setBlock(cell(x, y, z), identifier);
        },
        blockAt: (x, y, z) => world.world.blocks.get(cell(x, y, z))?.identifier,
        player: (x, y, z) => {
            nextPlayer += 1;
            const player: ContentEntity = { id: nextPlayer, identifier: 'minecraft:player', position: at(x, y, z) };
            players.push(player);
            world.players = [...world.players, player];
            return nextPlayer;
        },
        spawn: (identifier, x, y, z) => {
            const other = runtime.spawn(identifier, at(x, y, z));
            if (other === undefined) throw new Error(`the server could not spawn ${identifier}`);
            spawned.push(other);
            return other;
        },
        tick: (count = 1) => {
            for (let index = 0; index < count; index += 1) {
                clock += 1;
                world.advance(1);
                runtime.tick(clock);
            }
        },
        until: (predicate, limit) => {
            for (let ticks = 1; ticks <= limit; ticks += 1) {
                probe.tick();
                if (predicate()) return ticks;
            }
            return undefined;
        }
    };

    try {
        return body(probe);
    } finally {
        for (const other of spawned) if (other.removed === undefined) runtime.remove(other.id, 'parity probe');
        world.players = world.players.filter((player) => !players.includes(player));
        draws.splice(0, draws.length, 0.5);
    }
};
