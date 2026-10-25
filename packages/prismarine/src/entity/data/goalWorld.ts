/**
 * The two seams `@jsprismarine/entity-goals` needs, over one live entity.
 *
 * `EntityActuator` is the body: where it is, where it is going and where it is
 * looking. `GoalWorld` is everything else the 170 goals reach for - other
 * mobs, items on the ground, blocks, combat, riding, breeding and trade.
 *
 * `GoalWorld`'s members are all optional by design, and a goal whose world
 * cannot answer one refuses to start rather than throwing. The members left
 * out here are the ones this server has nowhere to get an answer from yet;
 * each is a goal that stays asleep rather than a goal that behaves wrongly.
 */
import type { EntityActuator, EntityPosition, FilterEntityView } from '@jsprismarine/entities';
import type { GoalItem, GoalMob, GoalWorld } from '@jsprismarine/entity-goals';

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
    target: () => {
        const target = entity.target === undefined ? undefined : scene.byId(entity.target);
        return target === undefined ? undefined : goalMobOf(target, scene);
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
export const goalWorldOf = (entity: MobBody, scene: EntityScene): GoalWorld => {
    const sorted = (candidates: readonly DataEntity[]) =>
        [...candidates].sort((a, b) => distance(entity.position, a.position) - distance(entity.position, b.position));

    return {
        navigation: () => scene.navigation(),
        mobs: (radius) =>
            sorted(scene.near(entity.position, radius).filter((other) => other.id !== entity.id)).map((other) =>
                goalMobOf(other, scene)
            ),
        players: (radius) =>
            scene.host
                .players()
                .filter((player) => distance(entity.position, player.position) <= radius)
                .sort((a, b) => distance(entity.position, a.position) - distance(entity.position, b.position))
                .map((player) => playerGoalMob(player.id, player.identifier, player.position)),
        items: (radius) => scene.items(entity.position, radius),
        blocks: (query) => scene.blocks(entity.position, query),
        target: () => {
            const target = entity.target === undefined ? undefined : scene.byId(entity.target);
            return target === undefined ? undefined : goalMobOf(target, scene);
        },
        setTarget: (mob) => {
            entity.target = typeof mob?.id === 'number' ? mob.id : undefined;
        },
        home: () => entity.home,
        setHome: (position) => {
            entity.home = position;
        },
        attack: (mob) => scene.attack(entity, mob),
        knockback: (mob, horizontal, vertical) => scene.knockback(entity, mob, horizontal, vertical),
        teleportTo: (position) => {
            entity.position = position;
            entity.stopMoving();
        },
        carriedItem: () => entity.carried,
        setCarriedItem: (identifier) => {
            entity.carried = identifier;
        },
        dropItem: (identifier, position) =>
            scene.host.drop(blockPositionOf(position ?? entity.position), { identifier, count: 1 }),
        setBlock: (position, identifier) =>
            scene.world.blocks.set(blockPositionOf(position), { identifier, states: {} }, true),
        spawn: (identifier, position, event) => {
            scene.spawn(identifier, position, { event });
        },
        playSound: (name) => scene.world.effects.playSound(blockPositionOf(entity.position), name),
        dropLoot: (table, position) => scene.dropLoot(table, position),
        canSee: (mob) => distance(entity.position, mob.position()) <= entity.facts.followRange,
        trigger: (event, target) => scene.trigger(entity, event, target),
        report: (message) => scene.report(`${entity.identifier}: ${message}`)
    };
};

/** Whether a mob is close enough for the entity's melee swing to land. */
export const withinMeleeReach = (from: EntityPosition, to: EntityPosition): boolean =>
    distance(from, to) <= MELEE_REACH;

/** A player as a goal sees one; the server answers no filter facts about it yet. */
const playerGoalMob = (id: number, identifier: string, position: EntityPosition): GoalMob => ({
    id,
    position: () => position,
    view: () => ({}),
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
