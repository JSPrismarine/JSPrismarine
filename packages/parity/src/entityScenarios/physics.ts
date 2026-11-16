import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { performPush } from '@jsprismarine/block-behaviors/rules/piston';
import { createVoxelWorld } from '@jsprismarine/block-behaviors';
import { collisionBox, statRuling } from '@jsprismarine/entities';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { loadJavaEntityAttributes } from '../goldens.ts';
import { isRecord } from '../isRecord.ts';
import { numericConstants, pinnedJavaMethod } from '../javaClassFile.ts';
import { unpackVanillaDatapack } from '../javaDatapack.ts';
import { realStack, serverContent } from '../serverStack.ts';
import type { RealStack } from '../serverStack.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring, field, mappedEntity } from './subjects.ts';

/**
 * Scenarios for how a body moves: gravity and drag, pushing, climbing, jumping, stepping,
 * floating and the block surfaces some mobs treat differently. Each one spawns the entity into the
 * shared parity runtime, ticks it, and compares where it went with what Java's travel code does.
 */

/** Java's `LivingEntity.DEFAULT_BASE_GRAVITY` and vertical air drag. */
const LIVING_GRAVITY = 0.08;
const LIVING_VERTICAL_DRAG = 0.98;

/** The y of the parity world's stone floor's top face; every lane stands on it. */
const GROUND = 64;

/** The water level of the pool the floating scenario fills, four blocks deep. */
const SURFACE = GROUND + 4;

/** How close two positions or speeds have to be to count as the same. */
const EPSILON = 1e-6;

/** The Java entity package each class name below is relative to. */
const ENTITY_PACKAGE = 'net/minecraft/world/entity';

/**
 * The Java class of each non-living entity type, which is where its gravity and pushability are
 * declared. A living entity's gravity is an attribute, read from the attribute dump instead.
 */
const NON_LIVING_CLASS: Readonly<Record<string, string>> = {
    'minecraft:area_effect_cloud': 'AreaEffectCloud',
    'minecraft:arrow': 'projectile/arrow/Arrow',
    'minecraft:breeze_wind_charge': 'projectile/hurtingprojectile/windcharge/BreezeWindCharge',
    'minecraft:dragon_fireball': 'projectile/hurtingprojectile/DragonFireball',
    'minecraft:egg': 'projectile/throwableitemprojectile/ThrownEgg',
    'minecraft:end_crystal': 'boss/enderdragon/EndCrystal',
    'minecraft:ender_pearl': 'projectile/throwableitemprojectile/ThrownEnderpearl',
    'minecraft:experience_bottle': 'projectile/throwableitemprojectile/ThrownExperienceBottle',
    'minecraft:experience_orb': 'ExperienceOrb',
    'minecraft:falling_block': 'item/FallingBlockEntity',
    'minecraft:fireball': 'projectile/hurtingprojectile/LargeFireball',
    'minecraft:firework_rocket': 'projectile/FireworkRocketEntity',
    'minecraft:fishing_bobber': 'projectile/FishingHook',
    'minecraft:lingering_potion': 'projectile/throwableitemprojectile/ThrownLingeringPotion',
    'minecraft:llama_spit': 'projectile/LlamaSpit',
    'minecraft:shulker_bullet': 'projectile/ShulkerBullet',
    'minecraft:small_fireball': 'projectile/hurtingprojectile/SmallFireball',
    'minecraft:snowball': 'projectile/throwableitemprojectile/Snowball',
    'minecraft:splash_potion': 'projectile/throwableitemprojectile/ThrownSplashPotion',
    'minecraft:tnt': 'item/PrimedTnt',
    'minecraft:trident': 'projectile/arrow/ThrownTrident',
    'minecraft:wind_charge': 'projectile/hurtingprojectile/windcharge/WindCharge',
    'minecraft:wither_skull': 'projectile/hurtingprojectile/WitherSkull'
};

/** The Java class of a non-living entity type, with the boat and minecart families named by their base class. */
const nonLivingClass = (javaId: string): string | undefined => {
    const own = NON_LIVING_CLASS[javaId];
    if (own !== undefined) return `${ENTITY_PACKAGE}/${own}`;
    if (/_(chest_)?(boat|raft)$/.test(javaId)) return `${ENTITY_PACKAGE}/vehicle/boat/AbstractBoat`;
    if (javaId === 'minecraft:minecart' || javaId.endsWith('_minecart'))
        return `${ENTITY_PACKAGE}/vehicle/minecart/AbstractMinecart`;
    return undefined;
};

/**
 * The living entities whose Java travel applies no gravity while they hover: `FlyingMob` (ghast,
 * phantom), the happy ghast's flying travel, the bat's own `aiStep`, the vex's and the ender
 * dragon's `noPhysics`, the wither's hover, and a `FlyingMoveControl` that hovers in place (bee,
 * allay).
 */
const JAVA_HOVERERS: ReadonlySet<string> = new Set([
    'minecraft:allay',
    'minecraft:bat',
    'minecraft:bee',
    'minecraft:ender_dragon',
    'minecraft:ghast',
    'minecraft:happy_ghast',
    'minecraft:phantom',
    'minecraft:vex',
    'minecraft:wither'
]);

/**
 * The living entities that fall slower than gravity: `Chicken.aiStep`, `Blaze.aiStep` and
 * `Parrot.calculateFlapping` each multiply a falling body's vertical speed by 0.6 every tick.
 */
const JAVA_SLOW_FALLERS: ReadonlySet<string> = new Set(['minecraft:blaze', 'minecraft:chicken', 'minecraft:parrot']);

/** Java's attribute dump, read once. */
let javaAttributes: ReturnType<typeof loadJavaEntityAttributes> | undefined;
const javaAttribute = (javaId: string, attribute: string): number | undefined => {
    javaAttributes ??= loadJavaEntityAttributes();
    const value = javaAttributes[javaId]?.attributes[attribute];
    return typeof value === 'number' ? value : undefined;
};

/** Whether Java runs the type as a `LivingEntity`, which is every type its attribute dump lists. */
const isJavaLiving = (javaId: string): boolean => javaAttribute(javaId, 'minecraft:gravity') !== undefined;

/** The first number a Java method's code pushes, which for a constant getter is what it returns. */
const javaReturnedConstant = (className: string, method: string): number | undefined =>
    numericConstants(pinnedJavaMethod(className, method)?.method)[0];

/**
 * A class's default gravity: the largest number its `getDefaultGravity` returns, which for the
 * minecart is the one it returns out of water.
 */
const javaDefaultGravity = (className: string): number => {
    const constants = numericConstants(pinnedJavaMethod(className, 'getDefaultGravity')?.method);
    return constants.length === 0 ? 0 : Math.max(...constants);
};

/** A live entity of the parity runtime, which the prismarine package does not export a path to by name. */
type DataEntity = NonNullable<ReturnType<RealStack['runtime']['spawn']>>;

/** Hands out a fresh patch of ground for each run, so no scenario stands in another's blocks. */
let nextLane = 0;
const lane = (): { readonly x: number; readonly z: number } => {
    nextLane += 1;
    return { x: 20_000 + (nextLane % 200) * 24, z: 20_000 + Math.floor(nextLane / 200) * 24 };
};

/**
 * A fresh lane with a dirt floor under it, which no silverfish can hide in: Java's
 * `Silverfish.MergeWithStoneGoal` takes one standing on stone out of the world.
 */
const dirtLane = (): { readonly x: number; readonly z: number } => {
    const at = lane();
    const { world } = realStack();
    for (let dx = -3; dx <= 3; dx += 1)
        for (let dz = -3; dz <= 3; dz += 1)
            world.setBlock({ x: at.x + dx, y: GROUND - 1, z: at.z + dz }, 'minecraft:dirt');
    return at;
};

/**
 * What the server did with one Bedrock type, measured once per scenario. Every boat variant Java
 * names spawns as the same Bedrock boat, so a measurement of that boat stands for all of them.
 */
const measured = new Map<string, unknown>();
const measureOnce = <T>(scenario: string, bedrock: string, measure: () => T): T => {
    const key = `${scenario}\u0000${bedrock}`;
    if (measured.has(key)) {
        // Only `measure` writes this key, so the stored value has its return type.
        return measured.get(key) as T;
    }
    const value = measure();
    measured.set(key, value);
    return value;
};

let tickCount = 0;
/** Runs one server tick of the shared runtime. */
const tick = (): void => {
    const { runtime, world } = realStack();
    tickCount += 1;
    world.advance();
    runtime.tick(tickCount);
};

/**
 * Spawns an entity, hands it to `use`, and takes it out again whatever `use` does.
 * @throws {Error} When the server refuses the spawn.
 */
const withEntity = <T>(
    bedrock: string,
    at: { readonly x: number; readonly y: number; readonly z: number },
    use: (entity: DataEntity) => T,
    event?: string
): T => {
    const { runtime } = realStack();
    const declared = runtime.content().entities.registry.get(bedrock)?.declaredComponents ?? [];
    const entity = runtime.spawn(bedrock, at, {
        ...(event === undefined ? {} : { event }),
        ...(declared.includes('jsprismarine:falling_block') ? { data: { block: 'minecraft:sand' } } : {})
    });
    if (entity === undefined) throw new Error(`the server refused to spawn ${bedrock}`);
    try {
        return use(entity);
    } finally {
        if (entity.removed === undefined) runtime.remove(entity.id, 'parity physics scenario');
    }
};

/** The fall a Java living body makes from rest: each tick moves by its velocity, then gravity and drag apply. */
const javaLivingFall = (ticks: number, gravity: number, slowFall: boolean): number[] => {
    const drops: number[] = [];
    let velocity = 0;
    for (let index = 0; index < ticks; index += 1) {
        drops.push(velocity);
        velocity = (velocity - gravity) * LIVING_VERTICAL_DRAG;
        if (slowFall && velocity < 0) velocity *= 0.6;
    }
    return drops;
};

/** Every Java entity type that declares one of the components, once each. */
const declaringAny = (...components: readonly string[]): readonly EntitySubject[] => {
    const seen = new Map<string, EntitySubject>();
    for (const component of components)
        for (const subject of entitiesDeclaring(component)) seen.set(subject.javaId, subject);
    return [...seen.values()].sort((left, right) => left.javaId.localeCompare(right.javaId, 'en'));
};

/** The components of `candidates` the subject's server definition declares. */
const declaredOf = (subject: EntitySubject, candidates: readonly string[]): readonly string[] => {
    const declared = serverContent().entities.registry.get(subject.bedrock)?.declaredComponents ?? [];
    return candidates.filter((component) => declared.includes(component));
};

const format = (value: number): string => String(Math.round(value * 10_000) / 10_000);

/** A client-owned body, which neither edition's server moves. */
const CLIENT_OWNED = 'minecraft:player';

/** The intentional classification for a player, whose body its client simulates in both editions. */
const clientPredicted = (subject: EntitySubject) =>
    subject.javaId === CLIENT_OWNED
        ? {
              kind: 'intentional' as const,
              reason: "The player's client moves its own body in both editions and the server accepts the result (exclusion 3 of the parity claim: client-predicted simulation)."
          }
        : undefined;

/** Java's sulfur cube archetypes from the datapack, with the attribute values each one gives a cube. */
interface SulfurArchetype {
    readonly name: string;
    readonly buoyant: boolean;
    readonly bounciness: number;
    readonly friction: number;
    readonly airDrag: number;
}

const sulfurArchetypes = (): readonly SulfurArchetype[] => {
    const directory = join(unpackVanillaDatapack(), 'data', 'minecraft', 'sulfur_cube_archetype');
    return readdirSync(directory)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
            // Parsed JSON boundary; only the fields named below are read.
            const archetype: unknown = JSON.parse(readFileSync(join(directory, file), 'utf-8'));
            const modifiers = field(archetype, 'attribute_modifiers');
            // Java's base values (`LivingEntity.createLivingAttributes`): bounciness 0, the two modifiers 1.
            const values: Record<string, number> = {
                'minecraft:bounciness': javaAttribute('minecraft:sulfur_cube', 'minecraft:bounciness') ?? 0,
                'minecraft:friction_modifier':
                    javaAttribute('minecraft:sulfur_cube', 'minecraft:friction_modifier') ?? 1,
                'minecraft:air_drag_modifier':
                    javaAttribute('minecraft:sulfur_cube', 'minecraft:air_drag_modifier') ?? 1
            };
            const bases = { ...values };
            if (Array.isArray(modifiers)) {
                for (const modifier of modifiers) {
                    const attribute = field(modifier, 'attribute');
                    const amount = field(modifier, 'amount');
                    const operation = field(modifier, 'operation');
                    if (typeof attribute !== 'string' || typeof amount !== 'number' || !(attribute in values)) continue;
                    // `AttributeInstance.calculateValue`: add_value to the base, then add_multiplied_total scales the sum.
                    if (operation === 'add_value') values[attribute] = (values[attribute] ?? 0) + amount;
                    else if (operation === 'add_multiplied_total')
                        values[attribute] = (values[attribute] ?? 0) * (1 + amount);
                    else if (operation === 'add_multiplied_base')
                        values[attribute] = (values[attribute] ?? 0) + (bases[attribute] ?? 0) * amount;
                }
            }
            return {
                name: file.replace(/\.json$/, ''),
                buoyant: field(archetype, 'buoyant') === true,
                bounciness: values['minecraft:bounciness'] ?? 0,
                friction: values['minecraft:friction_modifier'] ?? 1,
                airDrag: values['minecraft:air_drag_modifier'] ?? 1
            };
        });
};

/** A number a component carries, either bare or under `value`. */
const componentNumber = (entity: DataEntity, component: string): number | undefined => {
    const params = entity.instance.componentParams(component);
    if (typeof params === 'number') return params;
    const value = field(params, 'value');
    return typeof value === 'number' ? value : undefined;
};

/** Java's ground slide: one tick's horizontal speed kept on a block of `friction`, with the entity's friction modifier. */
const javaGroundDrag = (friction: number, frictionModifier: number, airDragModifier: number): number => {
    // `LivingEntity.computeModifiedFriction`: 1 - (1 - friction) * modifier, clamped to 0..1.
    const modified = (value: number, modifier: number): number => Math.min(1, Math.max(0, 1 - (1 - value) * modifier));
    return modified(friction, frictionModifier) * modified(0.91, airDragModifier);
};

/** The scenarios for how bodies move. */
export const physicsScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'falls-under-gravity',
        java: "A body in open air falls by its Java gravity: a living one moves by its velocity before gravity and the 0.98 drag apply, a hovering flyer stays put, and a non-living one gains its class's default gravity on the first tick.",
        reference:
            'Java LivingEntity.travelInAir (move, then Attributes.GRAVITY and 0.98), getDefaultGravity of each entity class in the pinned jar, FlyingMob.travel, Chicken.aiStep, Blaze.aiStep and Parrot.calculateFlapping (0.6 slow fall); projectile gravity is issue #3122',
        subjects: () => declaringAny('minecraft:physics', 'minecraft:can_fly'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => declaredOf(subject, ['minecraft:physics', 'minecraft:can_fly']),
        classify: clientPredicted,
        run: (subject) => {
            const { launch, drops, velocities } = measureOnce('falls-under-gravity', subject.bedrock, () => {
                const at = lane();
                return withEntity(subject.bedrock, { x: at.x + 0.5, y: 150, z: at.z + 0.5 }, (entity) => {
                    const start = entity.body.velocity.y;
                    const fallen: number[] = [];
                    const speeds: number[] = [];
                    for (let index = 0; index < 4 && entity.removed === undefined; index += 1) {
                        const before = entity.position.y;
                        tick();
                        fallen.push(before - entity.position.y);
                        speeds.push(entity.body.velocity.y);
                    }
                    return { launch: start, drops: fallen, velocities: speeds };
                });
            });
            if (subject.javaId === CLIENT_OWNED || JAVA_HOVERERS.has(subject.javaId)) {
                const moved = drops.some((drop) => drop > EPSILON);
                return moved
                    ? `it fell ${drops.map(format).join(', ')} over four ticks where Java's ${subject.javaId === CLIENT_OWNED ? 'server leaves the body to its client' : 'travel holds it in the air'}`
                    : undefined;
            }

            if (isJavaLiving(subject.javaId)) {
                const gravity = javaAttribute(subject.javaId, 'minecraft:gravity') ?? LIVING_GRAVITY;
                const java = javaLivingFall(drops.length, gravity, JAVA_SLOW_FALLERS.has(subject.javaId));
                const same = java.every((drop, index) => Math.abs(drop + (drops[index] ?? 0)) < EPSILON);
                return same
                    ? undefined
                    : `it fell ${drops.map(format).join(', ')} over four ticks where Java's falls ${java.map((drop) => format(Math.abs(drop))).join(', ')}`;
            }

            const className = nonLivingClass(subject.javaId);
            if (className === undefined) return `no Java class is known for ${subject.javaId}`;
            const gravity = javaDefaultGravity(className);
            if (gravity === 0)
                return drops.some((drop) => drop > EPSILON)
                    ? `it fell ${drops.map(format).join(', ')} over four ticks where Java gives it no gravity`
                    : undefined;
            // Every Java body that falls keeps between 0.9 and all of its speed per tick in air, and
            // applies its drag before or after its gravity, so its first tick lands in this range.
            const first = velocities[0] ?? 0;
            const candidates = [0.9, 1].flatMap((drag) => [(launch - gravity) * drag, launch * drag - gravity]);
            const lowest = Math.min(...candidates);
            const highest = Math.max(...candidates);
            return first >= lowest - EPSILON && first <= highest + EPSILON
                ? undefined
                : `its first tick took its vertical speed from ${format(launch)} to ${format(first)} where Java's gravity of ${format(gravity)} gives ${format(lowest)} to ${format(highest)}`;
        }
    },
    {
        name: 'pushed-by-entity',
        java: 'A pushable entity overlapping another mob is pushed away from it, and an unpushable one is not.',
        reference:
            "Java Entity.push(Entity) and isPushable: the pinned navigation dump's Mob.isPushable, LivingEntity.isPushable for the other living types, ArmorStand, AbstractBoat and AbstractMinecart's overrides and Entity's false",
        subjects: () => declaringAny('minecraft:pushable_by_entity', 'minecraft:pushable'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => declaredOf(subject, ['minecraft:pushable_by_entity', 'minecraft:pushable']),
        classify: clientPredicted,
        run: (subject) => {
            const { runtime } = realStack();
            const javaPushable = (() => {
                const navigation = serverContent().entities.javaNavigation?.[subject.javaId];
                if (navigation !== undefined) return navigation.pushable;
                if (subject.javaId === 'minecraft:armor_stand')
                    return javaReturnedConstant(`${ENTITY_PACKAGE}/decoration/ArmorStand`, 'isPushable') === 1;
                if (isJavaLiving(subject.javaId)) return true;
                const className = nonLivingClass(subject.javaId);
                return className !== undefined && javaReturnedConstant(className, 'isPushable') === 1;
            })();

            const pushed = measureOnce('pushed-by-entity', subject.bedrock, () => {
                const at = dirtLane();
                return withEntity(subject.bedrock, { x: at.x + 0.5, y: GROUND, z: at.z + 0.5 }, (entity) => {
                    const partner = runtime.spawn('minecraft:pig', { x: at.x + 0.75, y: GROUND, z: at.z + 0.5 });
                    if (partner === undefined) throw new Error('the server refused to spawn a pig');
                    try {
                        entity.body.velocity = { x: 0, y: 0, z: 0 };
                        tick();
                        return entity.body.velocity.x < -EPSILON || entity.position.x < at.x + 0.5 - EPSILON;
                    } finally {
                        if (partner.removed === undefined) runtime.remove(partner.id, 'parity physics scenario');
                    }
                });
            });
            if (pushed === javaPushable) return undefined;
            return javaPushable
                ? 'a pig standing in it did not push it, where Java pushes it away'
                : 'a pig standing in it pushed it, where Java does not push it';
        }
    },
    {
        name: 'pushed-by-piston',
        java: 'An extending piston carries an entity standing in front of its head one block along with the block it pushes.',
        reference: 'Java PistonMovingBlockEntity.moveCollidedEntities and Entity.getPistonPushReaction (NORMAL)',
        subjects: () => declaringAny('minecraft:pushable_by_block', 'minecraft:pushable'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => {
            const declared = declaredOf(subject, ['minecraft:pushable_by_block', 'minecraft:pushable']);
            return declared.length > 0 ? declared : ['minecraft:pushable_by_block'];
        },
        run: (subject) => {
            const world = createVoxelWorld();
            const dimension = world.overworld;
            const piston = { x: 0, y: 5, z: 0 };
            dimension.set({ x: 1, y: 5, z: 0 }, 'minecraft:stone');
            const id = dimension.addEntity(subject.bedrock, { x: 2, y: 5, z: 0 });
            if (
                !performPush(dimension, piston, 'east') ||
                dimension.identifierAt({ x: 2, y: 5, z: 0 }) !== 'minecraft:stone'
            )
                return 'the piston did not push the block in front of it';
            const moved = dimension.entities.find((entity) => entity.id === id);
            if (moved === undefined) return 'the piston removed the entity';
            return moved.position.x === 3
                ? undefined
                : 'the piston pushed the block in front of it and left the entity where it stood';
        }
    },
    {
        name: 'scaled-body',
        java: "A body's dimensions are its base box multiplied by its scale, as a baby's are its adult box times its age scale.",
        reference:
            'Java LivingEntity.getDimensions (getDefaultDimensions(pose).scale(getScale())) and getDefaultDimensions (EntityType dimensions scaled by getAgeScale)',
        subjects: () => entitiesDeclaring('minecraft:scale'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:scale'],
        run: (subject) => {
            const differences: string[] = [];
            for (const event of [undefined, 'minecraft:entity_born']) {
                const hasEvent =
                    event === undefined ||
                    isRecord(
                        field(
                            field(
                                field(
                                    serverContent().definitions.entities.get(subject.bedrock)?.data,
                                    'minecraft:entity'
                                ),
                                'events'
                            ),
                            event
                        )
                    );
                if (!hasEvent) continue;
                const at = lane();
                withEntity(
                    subject.bedrock,
                    { x: at.x + 0.5, y: GROUND, z: at.z + 0.5 },
                    (entity) => {
                        const scale = componentNumber(entity, 'minecraft:scale') ?? 1;
                        const declared = entity.instance.componentParams('minecraft:collision_box');
                        const width = field(declared, 'width');
                        const height = field(declared, 'height');
                        if (typeof width !== 'number' || typeof height !== 'number') return;
                        const box = entity.facts.box;
                        if (
                            Math.abs(box.width - width * scale) > EPSILON ||
                            Math.abs(box.height - height * scale) > EPSILON
                        )
                            differences.push(
                                `${event === undefined ? 'spawned' : 'born'} at scale ${format(scale)} its body is ${format(box.width)} by ${format(box.height)} where its ${format(width)} by ${format(height)} box scaled is ${format(width * scale)} by ${format(height * scale)}`
                            );
                    },
                    event
                );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'climbs-ladders',
        java: 'A living body in a ladder slides down no faster than 0.15 blocks a tick.',
        reference:
            'Java LivingEntity.onClimbable (block tag minecraft:climbable) and handleOnClimbable (fall clamped to -0.15)',
        subjects: () => declaringAny('minecraft:can_climb', 'minecraft:block_climber'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => declaredOf(subject, ['minecraft:can_climb', 'minecraft:block_climber']),
        classify: clientPredicted,
        run: (subject) => {
            const { world } = realStack();
            const at = lane();
            for (let y = GROUND; y < GROUND + 12; y += 1)
                for (let dx = -1; dx <= 1; dx += 1)
                    for (let dz = -1; dz <= 1; dz += 1)
                        world.setBlock({ x: at.x + dx, y, z: at.z + dz }, 'minecraft:ladder');
            return withEntity(subject.bedrock, { x: at.x + 0.5, y: GROUND + 8, z: at.z + 0.5 }, (entity) => {
                let fastest = 0;
                for (let index = 0; index < 8 && entity.removed === undefined; index += 1) {
                    const before = entity.position.y;
                    tick();
                    fastest = Math.max(fastest, before - entity.position.y);
                }
                // A hovering flyer does not fall in the first place.
                if (JAVA_HOVERERS.has(subject.javaId))
                    return fastest <= EPSILON
                        ? undefined
                        : `it fell ${format(fastest)} blocks a tick, where Java's travel holds it in the air`;
                // Java clamps the fall to 0.15 before each move, then applies gravity, drag and a slow faller's 0.6.
                let java = 0;
                let velocity = 0;
                for (let index = 0; index < 8; index += 1) {
                    velocity = Math.max(velocity, -0.15);
                    java = Math.max(java, -velocity);
                    velocity = (velocity - LIVING_GRAVITY) * LIVING_VERTICAL_DRAG;
                    if (JAVA_SLOW_FALLERS.has(subject.javaId) && velocity < 0) velocity *= 0.6;
                }
                return Math.abs(fastest - java) <= EPSILON
                    ? undefined
                    : `its fastest tick inside ladders fell ${format(fastest)} blocks, where Java's climber slides ${format(java)}`;
            });
        }
    },
    {
        name: 'jump-apex',
        java: "A jump from flat ground rises by Java's travel: the take-off speed moves the body before gravity and drag apply, at Java's jump strength.",
        reference:
            'Java LivingEntity.jumpFromGround and getJumpPower (Attributes.JUMP_STRENGTH), travelInAir, and Rabbit.getJumpPower (0.3 for a walking hop)',
        subjects: () => declaringAny('minecraft:jump.static', 'minecraft:jump.dynamic'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => declaredOf(subject, ['minecraft:jump.static', 'minecraft:jump.dynamic']),
        classify: (subject, difference) =>
            difference.startsWith('it jumps with power') &&
            statRuling(subject.bedrock, 'jump_strength').kind === 'bedrock'
                ? {
                      kind: 'intentional',
                      reason: `Bedrock decides jump strength (ADR 0001): ${statRuling(subject.bedrock, 'jump_strength').reason}`
                  }
                : undefined,
        run: (subject) => {
            const at = dirtLane();
            return withEntity(subject.bedrock, { x: at.x + 0.5, y: GROUND, z: at.z + 0.5 }, (entity) => {
                tick();
                entity.body.stopMoving();
                const start = entity.position.y;
                entity.body.jump();
                const power = entity.body.velocity.y;
                // A hovering flyer is never on the ground to jump from, in Java as here.
                if (power <= EPSILON)
                    return JAVA_HOVERERS.has(subject.javaId)
                        ? undefined
                        : 'it never left the ground when asked to jump';
                const javaPower =
                    subject.javaId === 'minecraft:rabbit'
                        ? 0.3
                        : (javaAttribute(subject.javaId, 'minecraft:jump_strength') ?? 0.42);
                const powerDifference =
                    Math.abs(power - javaPower) > 1e-4
                        ? `it jumps with power ${format(power)} where Java's is ${format(javaPower)}`
                        : undefined;
                // A hovering flyer's travel applies no gravity in either edition, so only its take-off compares.
                if (JAVA_HOVERERS.has(subject.javaId)) return powerDifference;
                let apex = start;
                for (let index = 0; index < 30 && entity.removed === undefined; index += 1) {
                    tick();
                    apex = Math.max(apex, entity.position.y);
                }
                let java = 0;
                let height = 0;
                for (
                    let velocity = power;
                    velocity > 0;
                    velocity = (velocity - LIVING_GRAVITY) * LIVING_VERTICAL_DRAG
                ) {
                    height += velocity;
                    java = Math.max(java, height);
                }
                if (Math.abs(apex - start - java) > 1e-4)
                    return `a jump at power ${format(power)} rose ${format(apex - start)} where Java's travel lifts it ${format(java)}`;
                return powerDifference;
            });
        }
    },
    {
        name: 'step-up',
        java: 'A walker steps onto a ledge no higher than its Java step height without jumping, and jumps for a higher one.',
        reference:
            'Java Entity.maxUpStep (Attributes.STEP_HEIGHT) and Entity.collide, and MoveControl jumping above it',
        subjects: () => entitiesDeclaring('minecraft:variable_max_auto_step'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:variable_max_auto_step'],
        run: (subject) => {
            const { world } = realStack();
            const at = lane();
            for (let dx = 2; dx <= 10; dx += 1)
                for (let dz = -2; dz <= 2; dz += 1)
                    world.setBlock({ x: at.x + dx, y: GROUND, z: at.z + dz }, 'minecraft:stone');
            const javaStep = javaAttribute(subject.javaId, 'minecraft:step_height') ?? 0.6;
            // The walker starts against the ledge and heads for the cell on top of it, the way a path step does.
            const width = serverContent().entities.registry.get(subject.bedrock)?.params(collisionBox)?.width ?? 1;
            return withEntity(
                subject.bedrock,
                { x: at.x + 2 - width / 2 - 0.05, y: GROUND, z: at.z + 0.5 },
                (entity) => {
                    let jumped = false;
                    for (let index = 0; index < 60 && entity.position.y < GROUND + 1 - EPSILON; index += 1) {
                        entity.body.moveTo({ x: at.x + 3.5, y: GROUND + 1, z: at.z + 0.5 }, 1);
                        tick();
                        if (entity.body.velocity.y > EPSILON) jumped = true;
                    }
                    if (entity.position.y < GROUND + 1 - EPSILON) return 'it never got onto a one-block ledge';
                    const javaJumps = javaStep < 1;
                    if (jumped === javaJumps) return undefined;
                    return javaJumps
                        ? `it walked up a one-block ledge, where Java's step height of ${format(javaStep)} makes it jump`
                        : `it jumped onto a one-block ledge, where Java's step height of ${format(javaStep)} walks it up`;
                }
            );
        }
    },
    {
        name: 'stands-on-powder-snow',
        java: "A mob in Java's powder_snow_walkable_mobs tag stands on powder snow.",
        reference:
            'Java PowderSnowBlock.canEntityWalkOnPowderSnow and the minecraft:powder_snow_walkable_mobs entity type tag',
        subjects: () => {
            const walkers = serverContent().tags.members('entity_type', 'minecraft:powder_snow_walkable_mobs');
            const declarers = entitiesDeclaring('minecraft:can_stand_on_powder_snow').map((subject) => subject.javaId);
            return [...new Set([...walkers, ...declarers])]
                .sort()
                .flatMap((javaId) => mappedEntity(javaId, walkers.includes(javaId) ? 'walks' : 'sinks') ?? []);
        },
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:can_stand_on_powder_snow'],
        run: (subject) => {
            /** Whether a body of this type is still on top of a powder snow block after a few ticks. */
            const standsOnPowderSnow = (bedrock: string): boolean => {
                const { world } = realStack();
                const at = lane();
                for (let dx = -1; dx <= 1; dx += 1)
                    for (let dz = -1; dz <= 1; dz += 1)
                        world.setBlock({ x: at.x + dx, y: GROUND, z: at.z + dz }, 'minecraft:powder_snow');
                return withEntity(bedrock, { x: at.x + 0.5, y: GROUND + 1, z: at.z + 0.5 }, (entity) => {
                    for (let index = 0; index < 10; index += 1) {
                        entity.body.stopMoving();
                        tick();
                    }
                    return entity.position.y >= GROUND + 1 - EPSILON;
                });
            };
            const stands = standsOnPowderSnow(subject.bedrock);
            if (subject.tag === 'walks') {
                if (!stands) return "it sank into powder snow, where Java's walkable mobs stand on it";
                // Standing only says something when the block would have swallowed another mob.
                return standsOnPowderSnow('minecraft:pig')
                    ? 'a pig stands on powder snow too, so the block holds every mob up where Java sinks the rest'
                    : undefined;
            }
            return stands ? 'it stands on powder snow, where Java sinks it' : undefined;
        }
    },
    {
        name: 'cobweb-slowdown',
        java: 'A cobweb slows a mob that walks through it to a quarter of its speed, except a spider, which crosses it unslowed.',
        reference:
            'Java WebBlock.entityInside (makeStuckInBlock with 0.25 horizontally) and Spider.makeStuckInBlock, which ignores the cobweb',
        subjects: () => [
            ...entitiesDeclaring('minecraft:block_movement_slowdown_immunity').map((subject) => ({
                ...subject,
                tag: 'immune'
            })),
            ...['minecraft:zombie'].flatMap((javaId) => mappedEntity(javaId, 'slowed') ?? [])
        ],
        idOf: (subject) => `${subject.tag}/${subject.javaId}`,
        covers: (subject) => (subject.tag === 'immune' ? subject.javaId : undefined),
        aspects: () => ['minecraft:block_movement_slowdown_immunity'],
        run: (subject) => {
            const stride = (bedrock: string, web: boolean): number => {
                const { world } = realStack();
                const at = lane();
                if (web)
                    for (let dx = -1; dx <= 8; dx += 1)
                        for (let y = GROUND; y < GROUND + 3; y += 1)
                            world.setBlock({ x: at.x + dx, y, z: at.z }, 'minecraft:web');
                return withEntity(bedrock, { x: at.x + 0.5, y: GROUND, z: at.z + 0.5 }, (entity) => {
                    const start = entity.position.x;
                    for (let index = 0; index < 10; index += 1) {
                        entity.body.moveTo({ x: at.x + 8.5, y: GROUND, z: at.z + 0.5 }, 1);
                        tick();
                    }
                    return entity.position.x - start;
                });
            };
            const ratioOf = (bedrock: string): number => {
                const open = stride(bedrock, false);
                return open <= EPSILON ? 1 : stride(bedrock, true) / open;
            };
            const ratio = ratioOf(subject.bedrock);
            if (subject.tag !== 'immune')
                return ratio < 0.5
                    ? undefined
                    : `a cobweb left it ${format(ratio)} of its open-ground distance, where Java slows it to a quarter`;
            if (ratio <= 0.9)
                return `a cobweb cut its walk to ${format(ratio)} of its open-ground distance, where Java's spider ignores cobwebs`;
            // Crossing unslowed only shows immunity when a cobweb slows the mobs that are not immune.
            return ratioOf('minecraft:zombie') < 0.5
                ? undefined
                : 'a cobweb slows no mob at all, so crossing it unslowed shows nothing about the immunity Java gives a spider';
        }
    },
    {
        name: 'ground-slide',
        java: "A body sliding across the ground keeps Java's ground friction each tick: the block's friction, modified by the entity's friction modifier, times 0.91.",
        reference:
            'Java LivingEntity.travelInAir and computeModifiedFriction (Attributes.FRICTION_MODIFIER and AIR_DRAG_MODIFIER)',
        subjects: () => declaringAny('minecraft:uses_legacy_friction', 'minecraft:friction_modifier'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) => declaredOf(subject, ['minecraft:uses_legacy_friction', 'minecraft:friction_modifier']),
        run: (subject) => {
            const differences: string[] = [];
            for (const [floor, friction] of [
                ['minecraft:stone', 0.6],
                ['minecraft:blue_ice', 0.989]
            ] as const) {
                const { world } = realStack();
                const at = lane();
                for (let dx = -2; dx <= 20; dx += 1)
                    for (let dz = -2; dz <= 2; dz += 1)
                        world.setBlock({ x: at.x + dx, y: GROUND - 1, z: at.z + dz }, floor);
                withEntity(subject.bedrock, { x: at.x + 0.5, y: GROUND, z: at.z + 0.5 }, (entity) => {
                    tick();
                    const frictionModifier = componentNumber(entity, 'minecraft:friction_modifier') ?? 1;
                    const airDragModifier = componentNumber(entity, 'minecraft:air_drag_modifier') ?? 1;
                    entity.body.stopMoving();
                    entity.body.velocity = { x: 0.4, y: 0, z: 0 };
                    tick();
                    const kept = entity.body.velocity.x / 0.4;
                    const java = javaGroundDrag(friction, frictionModifier, airDragModifier);
                    if (Math.abs(kept - java) > 1e-4)
                        differences.push(
                            `on ${floor} it kept ${format(kept)} of its slide where Java keeps ${format(java)}`
                        );
                });
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'sulfur-cube-archetype',
        java: "A sulfur cube that absorbs a block takes that archetype's bounciness, friction and air drag, floats when the archetype is buoyant, and drags uniformly while it holds the block.",
        reference:
            'Java data/minecraft/sulfur_cube_archetype/*.json attribute modifiers and buoyant flag, AttributeInstance.calculateValue, and SulfurCube.omnidirectionalAirMover (hasBodyItem)',
        subjects: () =>
            sulfurArchetypes().flatMap((archetype) => mappedEntity('minecraft:sulfur_cube', archetype.name) ?? []),
        idOf: (subject) => `${subject.javaId}/${subject.tag}`,
        covers: (subject) => subject.javaId,
        aspects: () => [
            'minecraft:bounciness',
            'minecraft:friction_modifier',
            'minecraft:air_drag_modifier',
            'minecraft:uses_uniform_air_drag',
            'minecraft:buoyant'
        ],
        run: (subject) => {
            const archetype = sulfurArchetypes().find((candidate) => candidate.name === subject.tag);
            if (archetype === undefined) return `Java has no ${subject.tag} archetype`;
            const at = lane();
            return withEntity(subject.bedrock, { x: at.x + 0.5, y: GROUND, z: at.z + 0.5 }, (entity) => {
                entity.instance.fire(`minecraft:become_${archetype.name}`);
                entity.instance.fire('minecraft:on_block_absorbed');
                tick();
                const differences: string[] = [];
                const compare = (label: string, server: number | undefined, java: number) => {
                    if (server === undefined || Math.abs(server - java) > 1e-4)
                        differences.push(
                            `${label} ${server === undefined ? 'unset' : format(server)} where Java's is ${format(java)}`
                        );
                };
                compare('bounciness', componentNumber(entity, 'minecraft:bounciness') ?? 0, archetype.bounciness);
                compare(
                    'friction modifier',
                    componentNumber(entity, 'minecraft:friction_modifier') ?? 1,
                    archetype.friction
                );
                compare(
                    'air drag modifier',
                    componentNumber(entity, 'minecraft:air_drag_modifier') ?? 1,
                    archetype.airDrag
                );
                if (entity.instance.hasComponent('minecraft:buoyant') !== archetype.buoyant)
                    differences.push(
                        archetype.buoyant ? 'it does not float where Java floats it' : 'it floats where Java sinks it'
                    );
                if (!entity.instance.hasComponent('minecraft:uses_uniform_air_drag'))
                    differences.push('holding its block it drags like a walker, where Java drags it uniformly');

                // The modifiers have to reach the slide: Java keeps the modified ground friction.
                entity.body.stopMoving();
                entity.body.velocity = { x: 0.4, y: 0, z: 0 };
                tick();
                const kept = entity.body.velocity.x / 0.4;
                const java = javaGroundDrag(0.6, archetype.friction, archetype.airDrag);
                if (Math.abs(kept - java) > 1e-4)
                    differences.push(`on stone it kept ${format(kept)} of its slide where Java keeps ${format(java)}`);
                return differences.length === 0 ? undefined : differences.join('; ');
            });
        }
    },
    {
        name: 'floats-in-water',
        java: 'A boat, a horse, an experience orb or a buoyant sulfur cube dropped onto deep water floats at its surface instead of sinking to the bottom.',
        reference:
            'Java AbstractBoat.floatBoat (IN_WATER buoyancy from getWaterLevelAbove), AbstractHorse FloatGoal, ExperienceOrb.setUnderwaterMovement, and the buoyant flag of the sulfur cube archetypes',
        subjects: () => entitiesDeclaring('minecraft:buoyant'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:buoyant'],
        run: (subject) => {
            const lowestTop = measureOnce('floats-in-water', subject.bedrock, () => {
                const { world } = realStack();
                const at = lane();
                for (let y = GROUND; y < SURFACE; y += 1)
                    for (let dx = -3; dx <= 3; dx += 1)
                        for (let dz = -3; dz <= 3; dz += 1)
                            world.world.blocks.set(
                                { x: at.x + dx, y, z: at.z + dz },
                                { identifier: 'minecraft:water', states: { liquid_depth: 0 } },
                                false
                            );
                const event = subject.javaId === 'minecraft:sulfur_cube' ? 'minecraft:become_regular' : undefined;
                return withEntity(subject.bedrock, { x: at.x + 0.5, y: SURFACE + 0.5, z: at.z + 0.5 }, (entity) => {
                    if (event !== undefined) entity.instance.fire(event);
                    // Settle first, then take the lowest the body sits over the next two seconds.
                    for (let index = 0; index < 80 && entity.removed === undefined; index += 1) tick();
                    let lowest = entity.position.y;
                    for (let index = 0; index < 40 && entity.removed === undefined; index += 1) {
                        tick();
                        lowest = Math.min(lowest, entity.position.y);
                    }
                    return lowest + entity.facts.box.height;
                });
            });
            return lowestTop >= SURFACE - EPSILON
                ? undefined
                : `its top sank to ${format(lowestTop)}, under a surface at ${SURFACE}`;
        }
    }
];
