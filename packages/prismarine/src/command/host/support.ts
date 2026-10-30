/**
 * The pieces every group of the server's `CommandHost` needs.
 *
 * Three mismatches between the seam `@jsprismarine/commands` defines and this
 * server are resolved here once, rather than in each of the sixty-odd verbs:
 *
 * - **Synchronous against asynchronous.** A host verb answers a question - how
 *   many blocks changed, whether the player exists - and almost every server
 *   API that carries the answer out is asynchronous, because the change goes
 *   over the wire. {@link carryOut} decides synchronously and parks the
 *   delivery on the queue `CommandManager.dispatchCommand` already awaits.
 * - **References against objects.** A command sees an `EntityRef`, seven
 *   fields and a stable id. {@link entityRefOf} makes one and
 *   {@link resolveEntity} finds the entity back.
 * - **Java dimension ids against Bedrock's.** Java spells the Nether
 *   `minecraft:the_nether` and the client `minecraft:nether`. A world's
 *   `DimensionType` carries both, and {@link worldOf} accepts either.
 */
import { CommandSyntaxException } from '@jsprismarine/brigadier';
import type { EntityRef, Vector3 as HostVector } from '@jsprismarine/commands';
import { Vector3 } from '@jsprismarine/math';

// Imported straight from their modules rather than through a barrel, for the
// reason `CommandManager` states: `index.ts` exports `./world/` before
// `Player`, so a barrel import lands in a half-initialized module.
import Player from '../../Player';
import type Server from '../../Server';
import type { Entity } from '../../entity/Entity';
import { dimensionByName } from '../../world/Dimension';
import type { World } from '../../world/World';
import { deferCommandWork } from '../Command';

/**
 * Refuses a command whose host verb has no subsystem behind it.
 *
 * Thrown rather than answered falsely. A verb that reported "nothing happened"
 * would be indistinguishable from a command that ran and found nothing, and
 * the player would be left retyping a command that can never work.
 *
 * @param subsystem - What the server would need, named so the message is useful.
 * @throws {CommandSyntaxException} Always; the caller never returns.
 */
export const unsupported: (subsystem: string) => never = (subsystem) =>
    refuse(`This server has no ${subsystem} yet, so that command cannot run`);

/**
 * Refuses a command that cannot do what it was asked.
 *
 * The seam's verbs answer counts and booleans, which say "nothing matched".
 * Some failures are not that: naming a scoreboard objective nobody created is
 * a mistake rather than an empty result, and Java reports it by name. This is
 * how a verb says so.
 *
 * @param message - What went wrong, written for the player who typed the line.
 * @throws {CommandSyntaxException} Always; the caller never returns.
 */
export const refuse: (message: string) => never = (message) => {
    throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherParseException().create(message);
};

/**
 * Starts work a host verb decided on and hands the promise to the dispatch.
 *
 * @param work - The delivery. Rejections reach the sender; see
 *   {@link deferCommandWork}.
 * @param answer - What the verb reports, decided before the work started.
 * @returns `answer`, unchanged, so a verb reads as one expression.
 */
export const carryOut = <T>(work: Promise<unknown>, answer: T): T => {
    deferCommandWork(work.then(() => undefined));
    return answer;
};

/** The command layer's id for the dimension a world is: the Java `dimension_type` id. */
export const dimensionIdOf = (world: World): string => world.getDimension().id;

/**
 * The world a dimension id names.
 *
 * @param dimension - A Java `dimension_type` id, or the Bedrock spelling of a vanilla one.
 * @returns The first loaded world in that dimension, or the default world when
 *   none matches, which is what a single-world server wants.
 */
export const worldOf = (server: Server, dimension: string): World => {
    const wanted = dimensionByName(dimension)?.id ?? dimension;
    const worlds = server.getWorldManager().getWorlds();
    return worlds.find((world) => dimensionIdOf(world) === wanted) ?? server.getWorldManager().getDefaultWorld();
};

/** Every dimension this server currently has a world for. */
export const loadedDimensions = (server: Server): readonly string[] => [
    ...new Set(server.getWorldManager().getWorlds().map(dimensionIdOf))
];

/**
 * The seven fields a command sees of an entity.
 *
 * The id is the runtime id as a string, which is unique per world and stable
 * for as long as the entity lives, so {@link resolveEntity} can find the
 * entity back from a reference a command has been carrying across a fork.
 */
export const entityRefOf = (entity: Entity): EntityRef => ({
    id: entity.getRuntimeId().toString(),
    type: entity.getType(),
    name: entity.getName(),
    isPlayer: entity instanceof Player,
    position: { x: entity.getPosition().getX(), y: entity.getFeetY(), z: entity.getPosition().getZ() },
    rotation: { yaw: entity.yaw, pitch: entity.pitch },
    dimension: dimensionIdOf(entity.getWorld())
});

/**
 * Finds the entity a reference stands for.
 *
 * A linear scan of the loaded worlds. The alternative, a live index keyed by
 * runtime id, would have to be invalidated on every despawn and world change;
 * a command touches a handful of entities and runs when a player typed it, so
 * the scan is the cheaper thing to be correct about.
 *
 * @returns The entity, or undefined when it has since despawned.
 */
export const resolveEntity = (server: Server, ref: EntityRef): Entity | undefined => {
    for (const world of server.getWorldManager().getWorlds()) {
        for (const entity of world.getEntities()) {
            if (entity.getRuntimeId().toString() === ref.id) return entity;
        }
    }
    return undefined;
};

/** The same, for the references a command resolved to players. */
export const resolvePlayer = (server: Server, ref: EntityRef): Player | undefined => {
    const entity = resolveEntity(server, ref);
    return entity instanceof Player ? entity : undefined;
};

/** A host position as this server's vector. */
export const vectorOf = (position: HostVector): Vector3 => new Vector3(position.x, position.y, position.z);

/** A block position, which Java floors rather than rounds so `-0.5` is in block `-1`. */
export const blockPositionOf = (position: HostVector): Vector3 =>
    new Vector3(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z));

/** The players a command's target list names, skipping the ones that have left. */
export const playersOf = (server: Server, refs: readonly EntityRef[]): Player[] =>
    refs.flatMap((ref) => {
        const player = resolvePlayer(server, ref);
        return player === undefined ? [] : [player];
    });
