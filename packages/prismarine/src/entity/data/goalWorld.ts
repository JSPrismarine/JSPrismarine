/**
 * The two seams `@jsprismarine/entity-goals` needs, over one live entity.
 *
 * `EntityActuator` is the body: where it is, where it is going and where it is
 * looking. `GoalWorld` is everything else the 170 goals reach for - other
 * mobs, items on the ground, blocks, combat, riding, breeding and trade.
 *
 * `GoalWorld`'s members are all optional by design, and a goal whose world
 * cannot answer one refuses to start rather than throwing. This host answers
 * all of them, which is what {@link goalWorldOf}'s `Required<GoalWorld>`
 * return type pins: a member added to the seam stops this file compiling
 * until the runtime can answer it, rather than quietly putting 52 goals to
 * sleep.
 */
import type { EntityActuator, EntityPosition, FilterEntityView } from '@jsprismarine/entities';
import type { GoalDamage, GoalItem, GoalMob, GoalWorld } from '@jsprismarine/entity-goals';

import type { DataEntity, MobBody } from './DataEntity';
import { distance } from './DataEntity';
import type { EntityScene } from './scene';

/** The reach of a melee swing, in blocks, which is Java's base attack range. */
const MELEE_REACH = 3;

/** One live entity as a goal sees another. */
export const goalMobOf = (entity: DataEntity, scene: EntityScene): GoalMob => ({
    id: entity.id,
    position: () => entity.position,
    view: (): FilterEntityView => entity.instance.filterContext().self,
    identifier: () => entity.identifier,
    heldItem: () => entity.carried,
    health: () => entity.instance.attributes.get('health')?.current,
    // Through `mobById` rather than `byId`, because a target is as often a player as a mob
    // and the two live in different indexes.
    target: () => (entity.target === undefined ? undefined : scene.mobById(entity.target)),
    lastDamager: () => {
        const last = entity.body.damage.last()?.sourceId;
        return last === undefined ? undefined : scene.mobById(last);
    }
});

/**
 * The movement and look control one entity's goals drive.
 *
 * Built over the body rather than over the entity, because a goal component
 * builds its `GoalSupport` while the `EntityInstance` is still being
 * constructed and reads the actuator there and then. The body exists first.
 */
export const actuatorOf = (body: MobBody, scene: EntityScene): EntityActuator => ({
    position: () => body.position,
    moveTo: (position, speedMultiplier) => body.moveTo(position, speedMultiplier),
    stopMoving: () => body.stopMoving(),
    lookAt: (position) => body.lookAt(position),
    // Nothing in the data-driven body leaves the ground yet, so a jump is the one actuator
    // member with no effect. It is here rather than absent because `EntityActuator` has no
    // optional members: a goal holding the `jump` control flag still runs, it just does not
    // leave the ground.
    jump: () => undefined,
    randomTarget: (xzDistance, yDistance) => randomTarget(body.position, scene, xzDistance, yDistance),
    nearestPlayer: (maxDistance) => nearestPlayerTo(body.position, scene, maxDistance)?.position
});

/** A reachable position in the box around a point, drawn from the world's own random source. */
const randomTarget = (
    here: EntityPosition,
    scene: EntityScene,
    xzDistance: number,
    yDistance: number
): EntityPosition | undefined => {
    const random = scene.world.random;
    for (let attempt = 0; attempt < RANDOM_TARGET_ATTEMPTS; attempt += 1) {
        const candidate = {
            x: Math.floor(here.x) + Math.round((random.nextFloat() * 2 - 1) * xzDistance) + 0.5,
            y: Math.floor(here.y) + Math.round((random.nextFloat() * 2 - 1) * yDistance),
            z: Math.floor(here.z) + Math.round((random.nextFloat() * 2 - 1) * xzDistance) + 0.5
        };
        if (scene.navigation().isPassable(candidate)) return candidate;
    }
    return undefined;
};

/** How many positions a random walk draws before giving up, as Java's `RandomPos` does. */
const RANDOM_TARGET_ATTEMPTS = 10;

/** The nearest player within a distance, or undefined when there is none. */
const nearestPlayerTo = (here: EntityPosition, scene: EntityScene, maxDistance: number) => {
    let nearest: { position: EntityPosition; away: number } | undefined;
    for (const player of scene.host.players()) {
        const away = distance(here, player.position);
        if (away > maxDistance) continue;
        if (nearest === undefined || away < nearest.away) nearest = { position: player.position, away };
    }
    return nearest;
};

/**
 * Builds the world seam for one entity's goals.
 *
 * Over the body rather than the entity, for the same reason the actuator is:
 * `GoalSupport` holds the world it was handed, and it is built while the
 * `EntityInstance` is still being constructed.
 */
export const goalWorldOf = (entity: MobBody, scene: EntityScene): Required<GoalWorld> => {
    const sorted = (candidates: readonly DataEntity[]) =>
        [...candidates].sort((a, b) => distance(entity.position, a.position) - distance(entity.position, b.position));

    return {
        navigation: () => scene.navigation(),
        // Players among them, because `nearest_attackable_target` searches this list and 49
        // vanilla entities use it with an `is_family: player` entry. Java's
        // `NearestAttackableTargetGoal` searches `LivingEntity`, which is players included;
        // `players` stays as the player-only list the tempt and follow goals ask for.
        mobs: (radius) =>
            [
                ...sorted(scene.near(entity.position, radius).filter((other) => other.id !== entity.id)).map((other) =>
                    goalMobOf(other, scene)
                ),
                ...scene.host
                    .players()
                    .filter((player) => distance(entity.position, player.position) <= radius)
                    .map((player) => playerGoalMob(player.id, player.identifier, player.position))
            ].sort((a, b) => distance(entity.position, a.position()) - distance(entity.position, b.position())),
        players: (radius) =>
            scene.host
                .players()
                .filter((player) => distance(entity.position, player.position) <= radius)
                .sort((a, b) => distance(entity.position, a.position) - distance(entity.position, b.position))
                .map((player) => playerGoalMob(player.id, player.identifier, player.position)),
        items: (radius) => scene.items(entity.position, radius),
        blocks: (query) => scene.blocks(entity.position, query),
        poi: (kind, radius) => scene.poi(kind, entity.position, radius),
        damagers: (): readonly GoalDamage[] =>
            entity.damage.records().map((record) => ({
                mob: record.sourceId === undefined ? undefined : scene.mobById(record.sourceId),
                cause: record.cause,
                total: record.total
            })),
        lastPusher: () => (entity.lastPusher === undefined ? undefined : scene.mobById(entity.lastPusher)),
        owner: () => (entity.owner === undefined ? undefined : scene.mobById(entity.owner)),
        vehicle: () => scene.vehicleOf(entity),
        riders: () => scene.ridersOf(entity),
        target: () => (entity.target === undefined ? undefined : scene.mobById(entity.target)),
        setTarget: (mob) => {
            entity.target = typeof mob?.id === 'number' ? mob.id : undefined;
        },
        home: () => entity.home,
        setHome: (position) => {
            entity.home = position;
        },
        attack: (mob) => scene.attack(entity, mob),
        shoot: (mob, projectile) => scene.shoot(entity, mob, projectile),
        knockback: (mob, horizontal, vertical) => scene.knockback(entity, mob, horizontal, vertical),
        push: (velocity) => entity.push(velocity),
        explode: () => scene.explode(entity),
        teleportTo: (position) => {
            entity.position = position;
            entity.stopMoving();
        },
        mount: (mob) => scene.mount(entity, mob),
        dismount: () => scene.dismount(entity),
        pickUp: (item) => scene.pickUp(entity, item),
        carriedItem: () => entity.carried,
        setCarriedItem: (identifier) => {
            entity.carried = identifier;
        },
        inventory: () => [...entity.inventory],
        giveItem: (mob, identifier) => scene.giveItem(entity, mob, identifier),
        dropItem: (identifier, position) =>
            scene.host.drop(blockPositionOf(position ?? entity.position), { identifier, count: 1 }),
        setBlock: (position, identifier) =>
            scene.world.blocks.set(blockPositionOf(position), { identifier, states: {} }, true),
        breakBlock: (position) => scene.breakBlock(position),
        spawn: (identifier, position, event) => {
            scene.spawn(identifier, position, { event });
        },
        playSound: (name) => scene.world.effects.playSound(blockPositionOf(entity.position), name),
        dropLoot: (table, position) => scene.dropLoot(table, position),
        openTrade: (player) => scene.openTrade(entity, player),
        tradingPlayer: () => (entity.tradingPlayer === undefined ? undefined : scene.mobById(entity.tradingPlayer)),
        setSitting: (sitting) => {
            entity.sitting = sitting;
        },
        setSleeping: (sleeping) => {
            entity.sleeping = sleeping;
        },
        canBreedWith: (mob) => scene.canBreedWith(entity, mob),
        breedWith: (mob) => scene.breedWith(entity, mob),
        canSee: (mob) => distance(entity.position, mob.position()) <= entity.facts.followRange,
        trigger: (event, target) => scene.trigger(entity, event, target),
        report: (message) => scene.report(`${entity.identifier}: ${message}`)
    };
};

/** Whether a mob is close enough for the entity's melee swing to land. */
export const withinMeleeReach = (from: EntityPosition, to: EntityPosition): boolean =>
    distance(from, to) <= MELEE_REACH;

/**
 * The families a player carries, which is what `is_family` compares a
 * targeting goal's `entity_types` entry against.
 *
 * Both names, because vanilla's entity files write both: a zombie's
 * `nearest_attackable_target` tests `player`, and the goals that spare
 * anything living test `mob`.
 */
const PLAYER_FAMILIES = ['player', 'mob'] as const;

/**
 * A player as a goal sees one.
 *
 * A player is not in the entity index and carries no component set, so the
 * only filter facts the server can answer about one are its identity and its
 * families. A filter asking anything else gets undefined and refuses, which is
 * the rule the whole seam follows.
 */
export const playerGoalMob = (id: number, identifier: string, position: EntityPosition): GoalMob => ({
    id,
    position: () => position,
    view: (): FilterEntityView => ({
        id: () => id,
        names: (name) => (name === 'is_family' ? PLAYER_FAMILIES : undefined)
    }),
    identifier: () => identifier
});

/** The block a position falls inside, which is the shape the world adapter takes. */
export const blockPositionOf = (position: EntityPosition) => ({
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
});

/** One item stack lying in the world, as the pickup goals read it. */
export type { GoalItem };
