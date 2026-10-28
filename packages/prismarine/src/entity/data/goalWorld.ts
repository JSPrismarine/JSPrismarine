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
import { canEntityAttack, canEntityAttackView, isShareablesParams } from '@jsprismarine/entities';
import type { EntityActuator, EntityPosition, FilterEntityView } from '@jsprismarine/entities';
import type { GoalDamage, GoalItem, GoalMob, GoalWorld } from '@jsprismarine/entity-goals';

import { EYE_HEIGHT } from '../Human';
import type { DataEntity, MobBody } from './DataEntity';
import { isReadyToBreed } from './breeding';
import { distance, squaredDistance } from './DataEntity';
import { blockPositionOf, entityEyePosition } from './position';
import type { EntityScene } from './scene';

/** The reach of a melee swing, in blocks, which is Java's base attack range. */
const MELEE_REACH = 3;

/** Reuses read-through goal views without tying an entity to another runtime's scene. */
const goalMobViews = new WeakMap<EntityScene, WeakMap<DataEntity, GoalMob>>();

/** One live entity as a goal sees another. */
export const goalMobOf = (entity: DataEntity, scene: EntityScene): GoalMob => {
    let sceneViews = goalMobViews.get(scene);
    if (sceneViews === undefined) {
        sceneViews = new WeakMap();
        goalMobViews.set(scene, sceneViews);
    }

    const existing = sceneViews.get(entity);
    if (existing !== undefined) return existing;

    const view: GoalMob = {
        id: entity.id,
        position: () => entity.position,
        lookPosition: () => entityEyePosition(entity.position, entity.facts.box.height),
        view: (): FilterEntityView => entity.instance.filterContext().self,
        identifier: () => entity.identifier,
        heldItem: () => entity.carried,
        inventory: () => entity.body.inventory,
        shareables: () => {
            const rules = entity.instance.componentParams('minecraft:shareables');
            return isShareablesParams(rules) ? rules : undefined;
        },
        health: () => entity.instance.attributes.get('health')?.current,
        // Through `mobById` rather than `byId`, because a target is as often a player as a mob
        // and the two live in different indexes.
        target: () => (entity.target === undefined ? undefined : scene.mobById(entity.target)),
        lastDamager: () => {
            const last = entity.body.damage.last()?.sourceId;
            return last === undefined ? undefined : scene.mobById(last);
        }
    };
    sceneViews.set(entity, view);
    return view;
};

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
    jump: () => body.jump(),
    randomTarget: (xzDistance, yDistance) => randomTarget(body.position, scene, xzDistance, yDistance),
    nearestPlayer: (maxDistance) => nearestPlayerTo(body.position, scene, maxDistance)?.position,
    randomPosition: (center, xDistance, yDistance, zDistance) =>
        randomPosition(center, scene, xDistance, yDistance, zDistance),
    targetPosition: () => (body.target === undefined ? undefined : scene.mobById(body.target)?.position()),
    teleportTo: (position) => body.teleportTo(position)
});

/** A reachable position in the box around a point, drawn from the world's own random source. */
const randomTarget = (
    here: EntityPosition,
    scene: EntityScene,
    xzDistance: number,
    yDistance: number
): EntityPosition | undefined => {
    return randomPosition(here, scene, xzDistance, yDistance, xzDistance);
};

/** A reachable position in a rectangular box around a point. */
const randomPosition = (
    center: EntityPosition,
    scene: EntityScene,
    xDistance: number,
    yDistance: number,
    zDistance: number
): EntityPosition | undefined => {
    const random = scene.world.random;
    for (let attempt = 0; attempt < RANDOM_TARGET_ATTEMPTS; attempt += 1) {
        const candidate = {
            x: Math.floor(center.x) + Math.round((random.nextFloat() * 2 - 1) * xDistance) + 0.5,
            y: Math.floor(center.y) + Math.round((random.nextFloat() * 2 - 1) * yDistance),
            z: Math.floor(center.z) + Math.round((random.nextFloat() * 2 - 1) * zDistance) + 0.5
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
    return {
        navigation: () => scene.navigation(),
        // Players among them, because `nearest_attackable_target` searches this list and 49
        // vanilla entities use it with an `is_family: player` entry. Java's
        // `NearestAttackableTargetGoal` searches `LivingEntity`, which is players included;
        // `players` stays as the player-only list the tempt and follow goals ask for.
        mobs: (radius, families) => {
            const here = entity.position;
            const found: Ranked[] = [];
            for (const other of scene.near(here, radius, families)) {
                if (other.id === entity.id || (families !== undefined && !other.instance.hasAnyFamily(families)))
                    continue;
                found.push({ mob: goalMobOf(other, scene), away: squaredDistance(here, other.position) });
            }
            if (families === undefined || PLAYER_FAMILIES.some((family) => families.includes(family)))
                appendPlayers(found, here, radius, scene);
            return nearestFirst(found);
        },
        isAttackable: (mob) => {
            if (mob.identifier?.() === 'minecraft:player' && typeof mob.id === 'number') {
                const player = scene.host.players().find((candidate) => candidate.id === mob.id);
                const attacker = scene.byId(entity.id);
                return (
                    player !== undefined &&
                    player.creative !== true &&
                    player.spectator !== true &&
                    attacker !== undefined &&
                    canEntityAttackView(attacker.instance, mob.view())
                );
            }

            if (typeof mob.id !== 'number') return true;
            const target = scene.byId(mob.id);
            const attacker = scene.byId(entity.id);
            return (
                target === undefined || attacker === undefined || canEntityAttack(attacker.instance, target.instance)
            );
        },
        players: (radius) => {
            const found: Ranked[] = [];
            appendPlayers(found, entity.position, radius, scene);
            return nearestFirst(found);
        },
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
        teleportTo: (position) => entity.teleportTo(position),
        removeSelf: () => scene.remove(entity.id, 'death_behavior'),
        mount: (mob) => scene.mount(entity, mob),
        dismount: () => scene.dismount(entity),
        pickUp: (item, count, options) => scene.pickUp(entity, item, count, options),
        craftInto: (inputIdentifier, outputIdentifier, availableInput, wantedOutput) =>
            scene.craftInto(inputIdentifier, outputIdentifier, availableInput, wantedOutput),
        carriedItem: () => entity.carried,
        itemCount: (identifier) =>
            entity.inventory.filter((item) => item === identifier).length +
            Object.values(entity.equipment).reduce(
                (count, item) => count + (item?.identifier === identifier ? item.count : 0),
                0
            ) +
            entity.containerSlots.reduce(
                (count, item) => count + (item?.identifier === identifier ? item.count : 0),
                0
            ),
        itemHasTag: (identifier, tag) => {
            const name = tag.startsWith('#') ? tag.slice(1) : tag;
            const namespaced = name.includes(':') ? name : `minecraft:${name}`;
            const type = scene.content().items.types.get(identifier);
            return type?.hasTag(name) === true || type?.hasTag(namespaced) === true;
        },
        setCarriedItem: (identifier) => {
            entity.carried = identifier;
        },
        inventory: () => [...entity.inventory],
        giveItem: (mob, identifier, count) => scene.giveItem(entity, mob, identifier, count),
        giveCraftedItem: (mob, craft) => scene.giveCraftedItem(entity, mob, craft),
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
        isReadyToBreed: () => {
            const self = scene.byId(entity.id);
            return self !== undefined && isReadyToBreed(self);
        },
        canBreedWith: (mob) => scene.canBreedWith(entity, mob),
        breedWith: (mob) => scene.breedWith(entity, mob),
        canSee: (mob) =>
            distance(entity.position, mob.position()) <= entity.facts.followRange &&
            scene.hasLineOfSight(
                entityEyePosition(entity.position, entity.facts.box.height),
                mob.lookPosition?.() ?? mob.position()
            ),
        trigger: (event, target) => scene.trigger(entity, event, target),
        report: (message) => scene.report(`${entity.identifier}: ${message}`)
    };
};

/** One candidate of a neighbor search, with the key the search orders it by. */
interface Ranked {
    readonly mob: GoalMob;
    /** The squared distance from the searching entity, which {@link nearestFirst} sorts on. */
    readonly away: number;
}

/**
 * Puts every player within a radius of a position on the end of a search.
 *
 * Players are the host's rather than the runtime's, so both neighbor searches
 * have to merge them in, and both have to rank them the same way the mobs are
 * ranked for the one sort to be right.
 */
const appendPlayers = (found: Ranked[], here: EntityPosition, radius: number, scene: EntityScene): void => {
    const within = radius * radius;
    for (const player of scene.host.players()) {
        const away = squaredDistance(here, player.position);
        if (away <= within)
            found.push({
                mob: playerGoalMob(
                    player.id,
                    player.identifier,
                    player.position,
                    player.tags,
                    scene.host.playerView?.(player.id)
                ),
                away
            });
    }
};

/**
 * Orders a neighbor search nearest first.
 *
 * One sort over a key worked out once per candidate. The comparator used to
 * recompute the distance for both sides of every comparison, which is a
 * `Math.hypot` per comparison rather than one per candidate, and the mobs were
 * sorted a second time before the players were merged in, which a stable sort
 * over the same key makes no difference at all.
 */
const nearestFirst = (found: Ranked[]): readonly GoalMob[] => {
    found.sort((a, b) => a.away - b.away);
    return found.map((candidate) => candidate.mob);
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
 * A player is not in the entity index and carries no component set. Use the
 * host's full filter view when it has one; otherwise answer identity, family,
 * and dynamic-tag facts and leave the rest unanswered.
 *
 * @param filterView - The host's live filter facts for this player, when available.
 */
export const playerGoalMob = (
    id: number,
    identifier: string,
    position: EntityPosition,
    tags: readonly string[] = [],
    filterView?: FilterEntityView
): GoalMob => ({
    id,
    position: () => position,
    lookPosition: () => ({ x: position.x, y: position.y + EYE_HEIGHT, z: position.z }),
    view: (): FilterEntityView =>
        filterView ?? {
            id: () => id,
            names: (name) => (name === 'is_family' ? PLAYER_FAMILIES : name === 'has_tag' ? tags : undefined)
        },
    identifier: () => identifier
});

/** One item stack lying in the world, as the pickup goals read it. */
export type { GoalItem };
