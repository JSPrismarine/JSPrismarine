/**
 * The level the twenty Java brain mobs read, and the body they drive.
 *
 * `BrainWorld` is one object for the whole dimension rather than one per
 * entity, which is why it is built once and why the body arrives as an
 * argument to every member that needs one. `BrainMob` is the per-entity half,
 * and it wraps the same {@link DataEntity} the goal actuator drives - the
 * camel and the happy ghast run both systems, and they have to agree about
 * where the entity is.
 */
import type {
    BrainEntity,
    BrainItemEntity,
    BrainMob,
    BrainNavigation,
    BrainWorld,
    EntityDimensions,
    PoiRecord,
    Vec3
} from '@jsprismarine/entity-brains';
import {
    blockContaining,
    blockPositionsInManhattanOrder,
    distanceSquared,
    entityIntersectsBounds,
    inflatedEntityBounds
} from '@jsprismarine/entity-brains';
import type { Brain } from '@jsprismarine/entity-brains';
import type { EntityPosition } from '@jsprismarine/entities';
import { Navigator, navigationProfile } from '@jsprismarine/entity-goals';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { EYE_HEIGHT } from '../playerEyes';
import type { ContentTags } from '../../content/tags';
import type { ContentEntity } from '../../content/world/adapter';
import type { DataEntity } from './DataEntity';
import { distance } from './DataEntity';
import { actuatorOf, withinMeleeReach } from './goalWorld';
import { blockPositionOf, ENTITY_EYE_HEIGHT_FRACTION } from './position';
import type { EntityScene } from './scene';
import { DEFAULT_BOX, PLAYER_BOX } from './facts';
import { clientOwnsMovement } from '../playerOverlay';

/** How far a sensor may look for a non-combat target when the type declares no follow range. */
const DEFAULT_FOLLOW_RANGE = 16;

/** Looks up a player through the tick index when the scene supplies one. */
const playerById = (scene: EntityScene, id: number) => {
    const indexed = scene.host.playerById;
    return indexed === undefined ? scene.host.players().find((player) => player.id === id) : indexed(id);
};

const NO_TAGS: ReadonlySet<string> = new Set();
// Weak keys let removed entities, old player snapshots, and content reloads be collected.
const brainEntityViews = new WeakMap<DataEntity, WeakMap<EntityScene, BrainEntity>>();
const brainMobViews = new WeakMap<DataEntity, Map<Brain, WeakMap<EntityScene, BrainMob>>>();
const brainPlayerViews = new WeakMap<ContentEntity, WeakMap<EntityScene, BrainEntity>>();
const tagsByContent = new WeakMap<ContentTags, Map<string, Map<string, ReadonlySet<string>>>>();
const itemsByContent = new WeakMap<ContentTags, Map<string, BrainItemEntity['item']>>();

/**
 * The entity type a brain reads, which is Java's: the brains are written against Java's
 * `minecraft:villager`, and the villager spawns here as `minecraft:villager_v2`.
 */
const javaTypeOf = (identifier: string): string =>
    identifier === VILLAGER_BEDROCK_TYPE ? 'minecraft:villager' : identifier;

const VILLAGER_BEDROCK_TYPE = (() => {
    const mapped = javaEntityTypeToBedrock('minecraft:villager');
    return mapped.kind === 'mapped' ? mapped.bedrock : 'minecraft:villager';
})();

/** One live entity as a brain sees it. */
export const brainEntityOf = (entity: DataEntity, scene: EntityScene): BrainEntity => {
    let viewsByScene = brainEntityViews.get(entity);
    const known = viewsByScene?.get(scene);
    if (known !== undefined) return known;

    let familyToken: object | undefined;
    let familyTags: ReadonlySet<string> = NO_TAGS;
    const eyePosition = {
        get x() {
            return entity.position.x;
        },
        get y() {
            return entity.position.y + entity.facts.box.height * ENTITY_EYE_HEIGHT_FRACTION;
        },
        get z() {
            return entity.position.z;
        }
    };
    // Memories keep BrainEntity references across ticks, like Java keeps Entity references.
    const view: BrainEntity = {
        id: String(entity.id),
        type: javaTypeOf(entity.identifier),
        get typeTags() {
            const token = entity.instance.componentSetToken;
            if (familyToken !== token) {
                // Component groups can replace families without replacing the entity view.
                familyToken = token;
                familyTags = new Set(entity.facts.families);
            }
            return familyTags;
        },
        get position() {
            return entity.position;
        },
        get dimensions() {
            return entity.facts.box;
        },
        eyePosition,
        get alive() {
            return entity.removed === undefined;
        },
        get baby() {
            return entity.instance.hasComponent('minecraft:is_baby');
        },
        spectator: false,
        canBeTargeted: () => entity.removed === undefined,
        get conditions() {
            return entity.conditions;
        },
        get mainHandItem() {
            const identifier = entity.carried;
            return identifier === undefined ? undefined : itemOf(identifier, scene);
        },
        get offHandItem() {
            const identifier = entity.body.equipment.offhand?.identifier;
            return identifier === undefined ? undefined : itemOf(identifier, scene);
        }
    };

    if (viewsByScene === undefined) {
        viewsByScene = new WeakMap();
        brainEntityViews.set(entity, viewsByScene);
    }
    viewsByScene.set(scene, view);
    return view;
};

/** A live player as a brain sees one, including its current combat eligibility. */
const brainPlayerOf = (player: ContentEntity, scene: EntityScene): BrainEntity => {
    let viewsByScene = brainPlayerViews.get(player);
    const known = viewsByScene?.get(scene);
    if (known !== undefined) return known;

    const current = () => playerById(scene, player.id);
    const position = () => current()?.position ?? player.position;
    const eyePosition = {
        get x() {
            return position().x;
        },
        get y() {
            return position().y + EYE_HEIGHT;
        },
        get z() {
            return position().z;
        }
    };
    const view: BrainEntity = {
        id: String(player.id),
        type: player.identifier,
        typeTags: NO_TAGS,
        get position() {
            return position();
        },
        dimensions: PLAYER_BOX,
        eyePosition,
        get alive() {
            return current() !== undefined;
        },
        baby: false,
        get spectator() {
            return current()?.spectator === true;
        },
        canBeTargeted: () => {
            const live = current();
            return live !== undefined && live.creative !== true && live.spectator !== true;
        },
        conditions: NO_TAGS
    };

    if (viewsByScene === undefined) {
        viewsByScene = new WeakMap();
        brainPlayerViews.set(player, viewsByScene);
    }
    viewsByScene.set(scene, view);
    return view;
};

/** The item tags of one item identifier, which is what a piglin's `piglin_loved` test reads. */
const itemTags = (identifier: string, tags: ContentTags): ReadonlySet<string> => {
    return contentTagsFor('item', identifier, tags);
};

/** A cached brain item view; both its id and tags depend only on content identity. */
const itemOf = (identifier: string, scene: EntityScene): BrainItemEntity['item'] => {
    const tags = scene.content().tags;
    let byIdentifier = itemsByContent.get(tags);
    const known = byIdentifier?.get(identifier);
    if (known !== undefined) return known;

    const item = { id: identifier, tags: itemTags(identifier, tags) };
    if (byIdentifier === undefined) {
        byIdentifier = new Map();
        itemsByContent.set(tags, byIdentifier);
    }
    byIdentifier.set(identifier, item);
    return item;
};

/** Resolves the tags containing one identifier through the built membership index. */
const contentTagsFor = (registry: string, identifier: string, tags: ContentTags): ReadonlySet<string> => {
    let byRegistry = tagsByContent.get(tags);
    const known = byRegistry?.get(registry)?.get(identifier);
    if (known !== undefined) return known;

    const found = new Set<string>();
    for (const tag of tags.tags(registry)) {
        if (tags.includes(registry, tag, identifier)) found.add(tag);
    }
    if (byRegistry === undefined) {
        byRegistry = new Map();
        tagsByContent.set(tags, byRegistry);
    }
    let byIdentifier = byRegistry.get(registry);
    if (byIdentifier === undefined) {
        byIdentifier = new Map();
        byRegistry.set(registry, byIdentifier);
    }
    byIdentifier.set(identifier, found);
    return found;
};

interface BrainNavigationState {
    readonly navigator: Navigator;
    destination: EntityPosition | undefined;
    speedModifier: number | undefined;
    stuck: boolean;
}

const brainNavigations = new WeakMap<DataEntity, BrainNavigationState>();

/** The path state one brain mob keeps while its behavior ticks. */
const brainNavigationStateOf = (entity: DataEntity, scene: EntityScene): BrainNavigationState => {
    const known = brainNavigations.get(entity);
    if (known !== undefined) return known;

    const state: BrainNavigationState = {
        navigator: new Navigator({
            actuator: actuatorOf(entity.body, scene),
            navigation: () => scene.navigation(),
            profile: () => navigationProfile(entity.instance)
        }),
        destination: undefined,
        speedModifier: undefined,
        stuck: false
    };
    brainNavigations.set(entity, state);
    return state;
};

/** Path following for one brain mob, over the same body the goals walk. */
const brainNavigationOf = (entity: DataEntity, scene: EntityScene): BrainNavigation => {
    const state = brainNavigationStateOf(entity, scene);
    return {
        moveTo: (target, speedModifier) => {
            const targetBlock = blockPositionOf(target);
            const currentBlock = state.destination === undefined ? undefined : blockPositionOf(state.destination);
            if (
                currentBlock?.x === targetBlock.x &&
                currentBlock.y === targetBlock.y &&
                currentBlock.z === targetBlock.z &&
                state.speedModifier === speedModifier &&
                state.navigator.walking
            )
                return true;

            state.destination = targetBlock;
            state.speedModifier = speedModifier;
            state.stuck = false;
            const started = state.navigator.moveTo(target, speedModifier, 0.5);
            if (!started) state.destination = undefined;
            return started;
        },
        isDone: () => !state.navigator.walking || state.navigator.arrived(),
        isStuck: () => state.stuck,
        canReach: (target) => state.navigator.canReach(target, 0.5),
        stop: () => {
            state.navigator.stop();
            state.destination = undefined;
            state.stuck = false;
        }
    };
};

/** Advances the cached brain path by one tick. */
export const tickBrainNavigation = (entity: DataEntity): void => {
    const state = brainNavigations.get(entity);
    if (state === undefined || !state.navigator.walking) return;

    const arrived = state.navigator.arrived();
    state.navigator.tick();
    if (!state.navigator.walking && !arrived && !state.navigator.arrived()) state.stuck = true;
};

/** The body one brain drives. */
export const brainMobOf = (entity: DataEntity, brain: Brain, scene: EntityScene): BrainMob => {
    let byBrain = brainMobViews.get(entity);
    let viewsByScene = byBrain?.get(brain);
    const known = viewsByScene?.get(scene);
    if (known !== undefined) return known;

    const view = brainEntityOf(entity, scene);
    // Spreading the entity view would eagerly read its getters and freeze tick-local values.
    const mob: BrainMob = {
        get id() {
            return view.id;
        },
        get type() {
            return view.type;
        },
        get typeTags() {
            return view.typeTags;
        },
        get position() {
            return view.position;
        },
        get dimensions() {
            return view.dimensions;
        },
        get eyePosition() {
            return view.eyePosition;
        },
        get alive() {
            return view.alive;
        },
        get baby() {
            return view.baby;
        },
        get spectator() {
            return view.spectator;
        },
        canBeTargeted: () => view.canBeTargeted?.() ?? true,
        get conditions() {
            return view.conditions;
        },
        get mainHandItem() {
            return view.mainHandItem;
        },
        get offHandItem() {
            return view.offHandItem;
        },
        brain,
        navigation: brainNavigationOf(entity, scene),
        setCondition: (condition, value) => {
            if (value) entity.conditions.add(condition);
            else entity.conditions.delete(condition);
        },
        lookAt: (position) => entity.body.lookAt(position),
        jump: () => entity.body.jump(),
        attack: (target) => {
            const other = scene.byId(Number(target.id));
            if (other === undefined) return;
            scene.attack(entity.body, {
                id: other.id,
                position: () => other.position,
                view: () => other.instance.filterContext().self
            });
        },
        playSound: (sound) => scene.world.effects.playSound(blockPositionOf(entity.position), sound),
        attribute: (attribute) => attributeOf(entity, attribute)
    };

    if (byBrain === undefined) {
        byBrain = new Map();
        brainMobViews.set(entity, byBrain);
    }
    if (viewsByScene === undefined) {
        viewsByScene = new WeakMap();
        byBrain.set(brain, viewsByScene);
    }
    viewsByScene.set(scene, mob);
    return mob;
};

/**
 * One of Java's attribute names as this runtime answers it.
 *
 * Java names an attribute `minecraft:follow_range`; Bedrock's component writes
 * `follow_range`. The two names mean the same number and only the prefix
 * differs, so the prefix is stripped rather than mapped.
 */
const attributeOf = (entity: DataEntity, attribute: string): number => {
    const name = attribute.replace(/^minecraft:/, '');
    if (name === 'follow_range' || name === 'tempt_range') return entity.facts.followRange || DEFAULT_FOLLOW_RANGE;
    if (name === 'movement_speed') return entity.facts.movement;
    if (name === 'max_health') return entity.facts.health;
    if (name === 'attack_damage') return entity.facts.attackDamage;
    return 0;
};

/** Builds the one `BrainWorld` for a dimension. */
export const brainWorldOf = (scene: EntityScene): BrainWorld => {
    const livingNear = (
        center: Vec3,
        radius: number,
        exclude: BrainEntity,
        excludeDimensions: EntityDimensions = exclude.dimensions ?? DEFAULT_BOX
    ): readonly BrainEntity[] => {
        const bounds = inflatedEntityBounds(center, excludeDimensions, radius);
        const found = new Map<
            string,
            { readonly entity: BrainEntity; readonly distance: number; readonly order: number }
        >();
        let order = 0;
        for (const candidate of scene.inBox(bounds.min, bounds.max)) {
            // A player is the host's below, whose view knows its game mode.
            if (
                String(candidate.id) === exclude.id ||
                candidate.removed !== undefined ||
                clientOwnsMovement(candidate.identifier)
            )
                continue;
            const entity = brainEntityOf(candidate, scene);
            // Java's nearest-first order is distance-based; caching the key also keeps ties stable.
            found.set(entity.id, { entity, distance: distance(center, entity.position), order });
            order += 1;
        }
        for (const player of scene.host.players()) {
            const id = String(player.id);
            if (id === exclude.id || found.has(id) || !entityIntersectsBounds(player.position, PLAYER_BOX, bounds)) {
                continue;
            }
            const entity = brainPlayerOf(player, scene);
            found.set(id, { entity, distance: distance(center, entity.position), order });
            order += 1;
        }
        return [...found.values()]
            .sort((a, b) => a.distance - b.distance || a.order - b.order)
            .map(({ entity }) => entity);
    };

    return {
        dimension: scene.world.level.dimension,
        gameTime: () => scene.world.level.gameTime(),
        dayTime: () => scene.world.level.dayTime(),
        random: () => scene.world.random.nextFloat(),
        randomInt: (bound) => scene.world.random.nextInt(bound),
        livingEntitiesNear: livingNear,
        players: () => scene.host.players().map((player) => brainPlayerOf(player, scene)),
        // Nothing indexes dropped items as brain entities yet, so the item sensors find none
        // rather than finding a guess. An allay with no item in range simply waits.
        itemEntitiesNear: (): readonly BrainItemEntity[] => [],
        canSee: (body, target) => distanceSquared(body.position, target.position) <= SIGHT_RANGE_SQUARED,
        isTargetable: (body, target) =>
            target.alive && !target.spectator && distanceSquared(body.position, target.position) <= SIGHT_RANGE_SQUARED,
        isAttackable: (body, target) =>
            target.alive &&
            !target.spectator &&
            target.canBeTargeted?.() !== false &&
            distanceSquared(body.position, target.position) <= SIGHT_RANGE_SQUARED,
        isWithinMeleeRange: (body, target) => withinMeleeReach(body.position, target.position),
        blockAt: (pos) => scene.world.blocks.get(pos)?.identifier ?? 'minecraft:air',
        isWaterAt: (pos) => scene.navigation().isWater(pos),
        canStandAt: (position) => {
            const navigation = scene.navigation();
            if (navigation.isWater(position) || navigation.isLava(position)) return false;
            return navigation.isPassable(position) && navigation.isSolid({ ...position, y: position.y - 1 });
        },
        blockTagsAt: (pos) => {
            const identifier = scene.world.blocks.get(pos)?.identifier;
            if (identifier === undefined) return NO_TAGS;
            const tags = scene.content().tags;
            return contentTagsFor('block', identifier, tags);
        },
        findBlock: (center, xzRange, yRange, test) => {
            const matches = (position: typeof center): boolean => {
                const block = scene.world.blocks.get(position);
                return (
                    block !== undefined &&
                    test(block.identifier, contentTagsFor('block', block.identifier, scene.content().tags), position)
                );
            };

            for (const position of blockPositionsInManhattanOrder(center, xzRange, yRange)) {
                if (matches(position)) return position;
            }
            return undefined;
        },
        randomPos: (body, request) => {
            const navigation = scene.navigation();
            for (let attempt = 0; attempt < RANDOM_POS_ATTEMPTS; attempt += 1) {
                const candidate = {
                    x: Math.floor(body.position.x) + offset(scene, request.xzRange) + 0.5,
                    y: Math.floor(body.position.y) + offset(scene, request.yRange),
                    z: Math.floor(body.position.z) + offset(scene, request.xzRange) + 0.5
                };
                if (!navigation.isPassable(blockContaining(candidate))) continue;
                if (request.away !== undefined && distanceSquared(candidate, request.away) <= RANDOM_POS_ATTEMPTS)
                    continue;
                return candidate;
            }
            return undefined;
        },
        // Points of interest need a village index the server does not keep. A brain whose
        // behavior needs one finds nothing, which is Java's own answer in an unvillaged world.
        pointsOfInterest: (center, radius, type): readonly PoiRecord[] =>
            scene.javaPointsOfInterest(center, radius, type).map(({ pos, type: kind, hasSpace }) => ({
                pos: { x: pos.x, y: pos.y, z: pos.z },
                type: kind,
                hasSpace
            })),
        claimPoi: (pos, claimant) => scene.claimPoi(pos, Number(claimant.id)),
        releasePoi: (pos, claimant) => scene.releasePoi(pos, Number(claimant.id)),
        playSound: (sound, pos) => scene.world.effects.playSound(blockPositionOf(pos), sound),
        emitGameEvent: (event, pos, source) =>
            scene.world.effects.emitGameEvent(
                event,
                blockPositionOf(pos),
                source === undefined ? undefined : Number(source.id)
            ),
        snifferDigPosition: (body) => {
            const entity = scene.byId(Number(body.id));
            return entity === undefined ? undefined : scene.snifferDigPosition(entity.body);
        },
        dropSnifferSeed: (body) => {
            const entity = scene.byId(Number(body.id));
            if (entity !== undefined) scene.dropSnifferSeed(entity.body);
        },
        sonicBoom: (body, target) => {
            const entity = scene.byId(Number(body.id));
            if (entity !== undefined) scene.sonicBoom(entity.body, Number(target.id));
        },
        villagerRaidState: (body) => {
            const entity = scene.byId(Number(body.id));
            return entity === undefined ? undefined : scene.villagerRaidState(entity.body);
        },
        villagerRaidEffect: (body, effect) => {
            const entity = scene.byId(Number(body.id));
            if (entity !== undefined) scene.villagerRaidEffect(entity.body, effect);
        },
        villagerWorkSpot: (body, task) => {
            const entity = scene.byId(Number(body.id));
            return entity === undefined ? undefined : scene.villagerWorkSpot(entity.body, task);
        },
        villagerTask: (body, task, target) => {
            const entity = scene.byId(Number(body.id));
            if (entity === undefined) return false;
            return scene.villagerTask(
                entity.body,
                task,
                target === undefined ? undefined : 'id' in target ? Number(target.id) : target
            );
        },
        villagerShowTrade: (body, shown) => {
            const entity = scene.byId(Number(body.id));
            if (entity !== undefined) scene.villagerShowTrade(entity.body, shown);
        },
        isVillageHero: (player) => scene.isVillageHero(Number(player.id)),
        villagerCanBreed: (body, partner) => {
            const entity = scene.byId(Number(body.id));
            return entity !== undefined && scene.villagerCanBreed(entity.body, Number(partner.id));
        },
        villagerRestock: (body) => {
            const entity = scene.byId(Number(body.id));
            if (entity !== undefined) scene.villagerRestock(entity.body);
        }
    };
};

/** How far a brain mob sees, squared, which is Java's `followRange` default of 16 blocks. */
const SIGHT_RANGE_SQUARED = DEFAULT_FOLLOW_RANGE * DEFAULT_FOLLOW_RANGE;

/** How many positions a brain's random draw tries before giving up. */
const RANDOM_POS_ATTEMPTS = 10;

/** One axis of a random draw, in whole blocks either side of the body. */
const offset = (scene: EntityScene, range: number): number =>
    Math.round((scene.world.random.nextFloat() * 2 - 1) * range);
