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

import { EYE_HEIGHT } from '../Human';
import type { ContentTags } from '../../content/tags';
import type { ContentEntity } from '../../content/world/adapter';
import type { DataEntity } from './DataEntity';
import { distance } from './DataEntity';
import { actuatorOf, withinMeleeReach } from './goalWorld';
import { blockPositionOf, entityEyePosition } from './position';
import type { EntityScene } from './scene';
import { DEFAULT_BOX, PLAYER_BOX } from './facts';

/** How far a sensor may look for a non-combat target when the type declares no follow range. */
const DEFAULT_FOLLOW_RANGE = 16;

/** One live entity as a brain sees it. */
export const brainEntityOf = (entity: DataEntity, scene: EntityScene): BrainEntity => ({
    id: String(entity.id),
    type: entity.identifier,
    typeTags: new Set(entity.facts.families),
    position: entity.position,
    dimensions: entity.facts.box,
    eyePosition: entityEyePosition(entity.position, entity.facts.box.height),
    alive: entity.removed === undefined,
    baby: entity.instance.hasComponent('minecraft:is_baby'),
    spectator: false,
    canBeTargeted: () => entity.removed === undefined,
    conditions: entity.conditions,
    mainHandItem:
        entity.carried === undefined ? undefined : { id: entity.carried, tags: itemTags(entity.carried, scene) },
    offHandItem:
        entity.body.equipment.offhand === undefined
            ? undefined
            : {
                  id: entity.body.equipment.offhand.identifier,
                  tags: itemTags(entity.body.equipment.offhand.identifier, scene)
              }
});

/** A live player as a brain sees one, including its current combat eligibility. */
const brainPlayerOf = (player: ContentEntity, scene: EntityScene): BrainEntity => ({
    id: String(player.id),
    type: player.identifier,
    typeTags: new Set(),
    position: player.position,
    dimensions: PLAYER_BOX,
    eyePosition: { x: player.position.x, y: player.position.y + EYE_HEIGHT, z: player.position.z },
    alive: true,
    baby: false,
    spectator: player.spectator === true,
    canBeTargeted: () => {
        const current = scene.host.players().find((candidate) => candidate.id === player.id);
        return current !== undefined && current.creative !== true && current.spectator !== true;
    },
    conditions: new Set()
});

/** The item tags of one item identifier, which is what a piglin's `piglin_loved` test reads. */
const itemTags = (identifier: string, scene: EntityScene): ReadonlySet<string> => {
    const tags = scene.content().tags;
    return contentTagsFor('item', identifier, tags);
};

/** Resolves the tags containing one identifier through the built membership index. */
const contentTagsFor = (registry: string, identifier: string, tags: ContentTags): ReadonlySet<string> => {
    const found = new Set<string>();
    for (const tag of tags.tags(registry)) {
        if (tags.includes(registry, tag, identifier)) found.add(tag);
    }
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
export const brainMobOf = (entity: DataEntity, brain: Brain, scene: EntityScene): BrainMob => ({
    ...brainEntityOf(entity, scene),
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
});

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
        const found = new Map<string, BrainEntity>();
        for (const candidate of scene.inBox(bounds.min, bounds.max)) {
            if (String(candidate.id) === exclude.id || candidate.removed !== undefined) continue;
            const entity = brainEntityOf(candidate, scene);
            found.set(entity.id, entity);
        }
        for (const player of scene.host.players()) {
            const id = String(player.id);
            if (id === exclude.id || found.has(id) || !entityIntersectsBounds(player.position, PLAYER_BOX, bounds)) {
                continue;
            }
            found.set(id, brainPlayerOf(player, scene));
        }
        return [...found.values()].sort((a, b) => distance(center, a.position) - distance(center, b.position));
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
            if (identifier === undefined) return new Set();
            const tags = scene.content().tags;
            return contentTagsFor('block', identifier, tags);
        },
        findBlock: (center, xzRange, yRange, test) => {
            const tags = scene.content().tags;
            const tagsByBlock = new Map<string, ReadonlySet<string>>();
            const blockTagsFor = (identifier: string): ReadonlySet<string> => {
                const known = tagsByBlock.get(identifier);
                if (known !== undefined) return known;

                const resolved = contentTagsFor('block', identifier, tags);
                tagsByBlock.set(identifier, resolved);
                return resolved;
            };

            const matches = (position: typeof center): boolean => {
                const block = scene.world.blocks.get(position);
                return block !== undefined && test(block.identifier, blockTagsFor(block.identifier), position);
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
        pointsOfInterest: (): readonly PoiRecord[] => [],
        claimPoi: () => false,
        releasePoi: () => undefined,
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
