import { BehaviorRegistry } from '@jsprismarine/content';
import type { AttributeName, EntityType, SharedStat } from '@jsprismarine/entities';
import { normalizedItemIdentifier } from '@jsprismarine/entities/components/shared';
import { SHARED_STATS, javaMoveControlTurn, noEffects, statRuling } from '@jsprismarine/entities';
import { findPath } from '@jsprismarine/entity-goals/navigation/pathfinder';
import { navigationProfile } from '@jsprismarine/entity-goals/navigation/profile';
import type { NavigationView } from '@jsprismarine/entity-goals/navigation/view';
import { voxelGrid } from '@jsprismarine/entity-goals/navigation/voxelGrid';
import {
    createTestWorld,
    deferredItemFactory,
    registerVanillaItemBehaviors,
    testSource
} from '@jsprismarine/item-behaviors';
import type { BlockStateValue } from '@jsprismarine/blocks/hooks';
import type { ItemHooks, ItemRegistry } from '@jsprismarine/items';
import { ItemStack, loadItemTypes } from '@jsprismarine/items';
import type { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';

import { LegacyRandomSource } from '@jsprismarine/worldgen/random/LegacyRandomSource';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { chiSquaredTest } from '../chiSquared.ts';
import { loadJavaEntityAttributes } from '../goldens.ts';
import { realStack, seededDraws, serverContent } from '../serverStack.ts';
import { withProbe } from './goalProbe.ts';
import type { EntitySubject } from './subjects.ts';
import { componentValues, entitiesDeclaring, field } from './subjects.ts';

/**
 * The stats and movement scenarios: what an entity spawns with, how hard it hits, how its move
 * control turns it, what its path finder will route through, and who drives it once ridden,
 * each against Java's rule.
 */

/** One live entity of the shared runtime. */
type DataEntity = NonNullable<ReturnType<EntityRuntime['spawn']>>;

/** Where this module's scenarios spawn, far from the blocks and mobs the other themes place. */
const ORIGIN = { x: 40_000.5, y: 64, z: 40_000.5 };

/** A position in this module's corner of the shared world, `slot` columns along from the origin. */
const slotAt = (slot: number): { x: number; y: number; z: number } => ({ ...ORIGIN, x: ORIGIN.x + slot * 16 });

/**
 * Spawns one entity in the shared runtime, hands it to `observe`, and removes it again.
 *
 * The runtime applies the stat decision of ADR 0001 and pins Java's navigation when it spawns,
 * because the server content carries Java's tables, so what `observe` reads is what an
 * operator's world would hold.
 */
const withSpawned = <Result>(
    bedrock: string,
    observe: (entity: DataEntity) => Result,
    at: { x: number; y: number; z: number } = ORIGIN
): Result => {
    const { runtime } = realStack();
    // A dropped item means nothing without its stack, so the server spawns one only with a stack.
    const entity =
        bedrock === 'minecraft:item'
            ? runtime.droppedItems.spawn(at, { stack: { name: 'minecraft:stone', count: 1 } })
            : runtime.spawn(bedrock, at);
    if (entity === undefined) throw new Error(`the server spawned no ${bedrock}`);
    try {
        return observe(entity);
    } finally {
        if (entity.removed === undefined) runtime.remove(entity.id, 'parity stats scenario complete');
    }
};

/** The resolved server type of a Bedrock entity. */
const typeOf = (bedrock: string): EntityType => {
    const type = serverContent().entities.registry.get(bedrock);
    if (type === undefined) throw new Error(`the server declares no ${bedrock}`);
    return type;
};

/**
 * The component group of a type that carries a component, when its base components do not. A
 * mob that carries it in one group per difficulty gives the Normal one, the difficulty these
 * comparisons hold Java to.
 */
const groupDeclaring = (bedrock: string, component: string): string | undefined => {
    const declaring = [...typeOf(bedrock).groups]
        .filter(([, group]) => group.components.some((bound) => bound.name === component))
        .map(([name]) => name);
    return declaring.find((name) => name.includes('normal')) ?? declaring[0];
};

/**
 * Puts the component on a spawned entity when its spawn state lacks it, by adding the first
 * group that declares it, so a component a mob only carries once angry, adult or saddled is
 * observed in the state that carries it.
 */
const activate = (entity: DataEntity, component: string): void => {
    if (entity.instance.hasComponent(component)) return;
    const group = groupDeclaring(entity.identifier, component);
    if (group !== undefined) entity.instance.applyEffects({ ...noEffects('parity:activate'), addGroups: [group] });
};

/** The walk controls a scenario keeps for itself once {@link holdWalk} has taken them from the goals. */
interface HeldWalk {
    readonly moveTo: (position: { x: number; y: number; z: number }, speed: number) => void;
    readonly stopMoving: () => void;
}

/**
 * Holds a spawned mob to the walk a scenario sets: its goals and brain run as usual, but a
 * `moveTo` or `stopMoving` of theirs is ignored, so a tick measures the move control and the
 * physics rather than whichever goal took the walk over.
 */
const holdWalk = (entity: DataEntity): HeldWalk => {
    const { body } = entity;
    const held: HeldWalk = { moveTo: body.moveTo.bind(body), stopMoving: body.stopMoving.bind(body) };
    body.moveTo = () => undefined;
    body.stopMoving = () => undefined;
    return held;
};

/** Runs one event on a spawned entity and applies it now, as the next tick would. */
const fireNow = (entity: DataEntity, event: string): void => {
    entity.instance.fire(event);
    entity.instance.applyQueuedEvents();
};

/** Whether two stats are the same number, with room for a float written as a double. */
const agrees = (left: number, right: number): boolean =>
    Math.abs(left - right) <= Math.max(1e-5, Math.abs(right) * 1e-5);

/** The Java dump's value for one shared stat of one Java entity type, when Java publishes it. */
const javaStat = (javaId: string, stat: SharedStat): number | undefined => {
    const key = SHARED_STATS[stat].javaAttribute;
    return key === undefined ? undefined : loadJavaEntityAttributes()[javaId]?.attributes[key];
};

/** What the active component declares for its attribute: the `value` and, for a pool, the `max`. */
const declaredStat = (entity: DataEntity, component: string, stat: SharedStat): number | undefined => {
    const params = entity.instance.componentParams(component);
    const value = field(params, stat === 'max_health' ? 'max' : 'value');
    return typeof value === 'number' ? value : undefined;
};

/** One shared stat an attribute component declares. */
interface StatAspect {
    /** The component that declares the stat, such as `minecraft:health`. */
    readonly component: string;
    readonly stat: SharedStat;
}

/**
 * The hit points Java gives an entity that has no attribute supplier, by the field its class
 * keeps them in.
 */
const JAVA_HIT_POINTS: Readonly<Record<string, number>> = {
    // ExperienceOrb.health
    'minecraft:experience_orb': 5,
    // ItemEntity.health
    'minecraft:item': 5
};

/**
 * Compares one shared stat on the spawned entity with Java's attribute supplier.
 *
 * A disagreement is read through `statRuling`, so the verdict is ADR 0001's rather than a second
 * copy of it. A stat Bedrock decides, or a reviewed exception, is intentional only while the
 * server runs the number the pack declares, which is what the decision promises; a server that
 * runs neither edition's number is a defect either way.
 */
const statScenario = ({ component, stat }: StatAspect): BehaviorScenario<EntitySubject> => ({
    name: `spawn-${component.replace('minecraft:', '').replace('.', '-')}`,
    java: `An entity spawns with the ${stat} its Java attribute supplier publishes, unless ADR 0001 gives the stat or the row to Bedrock.`,
    reference: `Java ${SHARED_STATS[stat].javaAttribute ?? stat} in each type's createAttributes (packages/bedrock-data/src/jsp/java/26.3/entity_attributes.json); docs/adr/0001-entity-stat-authority.md`,
    subjects: () => entitiesDeclaring(component),
    idOf: (subject) => subject.javaId,
    aspects: () => [component],
    run: (subject) => {
        const observed = withSpawned(subject.bedrock, (entity) => {
            activate(entity, component);
            const attribute: AttributeName | undefined = SHARED_STATS[stat].attribute;
            const value = attribute === undefined ? undefined : entity.instance.attributes.get(attribute);
            return {
                server: stat === 'max_health' ? value?.max : value?.base,
                current: value?.current,
                declared: declaredStat(entity, component, stat)
            };
        });
        const { server, declared } = observed;
        if (server === undefined) return `the spawned ${subject.bedrock} carries no ${stat}`;
        // Java's LivingEntity starts every mob at full health.
        if (stat === 'max_health' && observed.current !== server)
            return `it spawns with ${observed.current} of its ${server} health, where Java starts it full`;

        const java =
            javaStat(subject.javaId, stat) ?? (stat === 'max_health' ? JAVA_HIT_POINTS[subject.javaId] : undefined);
        if (subject.javaId === 'minecraft:end_crystal') {
            // EndCrystal.hurtServer removes the crystal on any blow, however small.
            const broken = withSpawned(subject.bedrock, (entity) => {
                realStack().runtime.hurt(entity, undefined, 'entity_attack', 0.5);
                return entity.removed !== undefined || (entity.instance.attributes.get('health')?.current ?? 1) <= 0;
            });
            return broken
                ? undefined
                : 'a half-point blow leaves it standing, where Java breaks an end crystal on any blow';
        }
        if (java !== undefined && agrees(server, java)) return undefined;
        const ruling = statRuling(subject.bedrock, stat);
        if (ruling.kind !== 'java' && declared !== undefined && !agrees(server, declared))
            return `the server spawns it with ${stat} ${server}, neither Java's ${String(java)} nor the ${declared} the pack declares`;
        return java === undefined
            ? `Java publishes no ${stat} for ${subject.javaId}; the server spawns it with ${server}`
            : `the server spawns it with ${stat} ${server}, where Java has ${java}`;
    },
    classify: (subject, difference) => {
        if (difference.includes('neither Java')) return undefined;
        const ruling = statRuling(subject.bedrock, stat);
        return ruling.kind === 'java' ? undefined : { kind: 'intentional', reason: ruling.reason };
    }
});

/** The shared stats one attribute component declares, apart from `minecraft:attack`'s damage. */
const STAT_ASPECTS: readonly StatAspect[] = [
    { component: 'minecraft:health', stat: 'max_health' },
    { component: 'minecraft:follow_range', stat: 'follow_range' },
    { component: 'minecraft:knockback_resistance', stat: 'knockback_resistance' },
    { component: 'minecraft:attack_damage', stat: 'attack_damage' },
    { component: 'minecraft:movement', stat: 'movement_speed' },
    { component: 'minecraft:flying_speed', stat: 'flying_speed' },
    { component: 'minecraft:horse.jump_strength', stat: 'jump_strength' }
];

/** The goals that land a melee blow, which is all `minecraft:attack`'s damage is read by. */
const MELEE_GOALS = [
    'minecraft:behavior.melee_attack',
    'minecraft:behavior.melee_box_attack',
    'minecraft:behavior.delayed_attack',
    'minecraft:behavior.ocelotattack',
    'minecraft:behavior.slime_attack',
    'minecraft:behavior.ram_attack',
    'minecraft:behavior.stomp_attack',
    'minecraft:behavior.swoop_attack',
    'minecraft:behavior.charge_attack',
    'minecraft:behavior.aquatic_charge_attack'
];

/**
 * The blows Java's own code draws rather than dealing the attribute flat, as the lowest and
 * highest damage one blow can deal from the attribute `damage`.
 */
const JAVA_DRAWN_BLOWS: Readonly<Record<string, (damage: number) => readonly [number, number]>> = {
    // IronGolem.doHurtTarget: damage / 2 + random.nextInt((int) damage).
    'minecraft:iron_golem': (damage) => [damage / 2, damage / 2 + Math.trunc(damage) - 1],
    // HoglinBase.hurtAndThrowTarget, for an adult: the same draw.
    'minecraft:hoglin': (damage) => [damage / 2, damage / 2 + Math.trunc(damage) - 1],
    'minecraft:zoglin': (damage) => [damage / 2, damage / 2 + Math.trunc(damage) - 1]
};

/** The status effect a Java mob's melee blow adds on Normal difficulty, in seconds. */
const JAVA_MELEE_EFFECTS: Readonly<Record<string, { readonly effect: string; readonly seconds: number }>> = {
    // CaveSpider.doHurtTarget: 7 seconds on Normal, 15 on Hard.
    'minecraft:cave_spider': { effect: 'poison', seconds: 7 },
    // Bee.doHurtTarget: 10 seconds on Normal, 18 on Hard.
    'minecraft:bee': { effect: 'poison', seconds: 10 },
    // WitherSkeleton.doHurtTarget: 200 ticks.
    'minecraft:wither_skeleton': { effect: 'wither', seconds: 10 },
    // Husk.doHurtTarget: 140 ticks per whole point of effective difficulty, which a fresh Normal world holds at 1.5.
    'minecraft:husk': { effect: 'hunger', seconds: 7 }
};

/** One melee blow the server deals: the range it draws from, one blow's damage, and the effect it adds. */
interface ObservedBlow {
    readonly range: readonly [number, number] | undefined;
    readonly dealt: number;
    readonly effect: { readonly id: string; readonly seconds: number } | undefined;
}

/** Lands one blow from a spawned attacker on a fresh target, through the runtime's melee path. */
const landBlow = (attacker: DataEntity): ObservedBlow => {
    const { runtime } = realStack();
    const declared = attacker.instance.attributes.get('attack_damage');
    const range: readonly [number, number] | undefined =
        declared === undefined ? undefined : [declared.current, Math.max(declared.current, declared.max)];
    // An iron golem has no armor, no damage sensor that refuses a melee blow, and the health to survive one.
    return withSpawned(
        'minecraft:iron_golem',
        (target) => {
            const goal = runtime.mobById(target.id);
            if (goal === undefined) throw new Error('the runtime exposes no goal view of the target');
            const before = target.instance.attributes.get('health')?.current ?? 0;
            runtime.attack(attacker.body, goal);
            const after = target.instance.attributes.get('health')?.current ?? 0;
            const effect = [...target.body.statusEffects.values()][0];
            return {
                range,
                dealt: before - after,
                effect:
                    effect === undefined
                        ? undefined
                        : { id: effect.id.replace('minecraft:', ''), seconds: effect.durationTicks / 20 }
            };
        },
        slotAt(1)
    );
};

/** The `minecraft:attack` scenario: what one blow deals and adds, against the Java mob's `doHurtTarget`. */
const attackScenario: BehaviorScenario<EntitySubject> = {
    name: 'melee-blow',
    java: "A mob's melee blow deals its Java attack damage, drawn where Java's class draws it, and adds the status effect Java's doHurtTarget adds on Normal difficulty.",
    reference:
        'Java Mob.doHurtTarget (the attack_damage attribute), IronGolem.doHurtTarget and HoglinBase.hurtAndThrowTarget (damage / 2 + nextInt(damage)), CaveSpider, Bee, WitherSkeleton and Husk doHurtTarget; docs/adr/0001-entity-stat-authority.md',
    subjects: () => entitiesDeclaring('minecraft:attack'),
    idOf: (subject) => subject.javaId,
    aspects: () => ['minecraft:attack'],
    run: (subject) => {
        const declared = typeOf(subject.bedrock).declaredComponents;
        const melee = MELEE_GOALS.some((goal) => declared.includes(goal));
        const java = javaStat(subject.javaId, 'attack_damage');
        if (java === undefined) {
            // Java gives the mob no attack damage, so it lands no blow; the server's damage only
            // matters if a melee goal can land one.
            return melee
                ? `Java gives ${subject.javaId} no melee attack, but the server can land one with its declared damage`
                : undefined;
        }

        const blow = withSpawned(subject.bedrock, (entity) => {
            // A mob that picks its attack by difficulty adds that group from its first ticks.
            for (let tick = 0; tick < 3 && !entity.instance.hasComponent('minecraft:attack'); tick += 1)
                entity.instance.tick(false);
            activate(entity, 'minecraft:attack');
            return landBlow(entity);
        });
        if (blow.range === undefined) return 'the server gives it no attack damage';
        const differences: string[] = [];

        const [javaLow, javaHigh] = JAVA_DRAWN_BLOWS[subject.javaId]?.(java) ?? [java, java];
        const [low, high] = blow.range;
        if (!agrees(low, javaLow) || !agrees(high, javaHigh)) {
            const ruling = statRuling(subject.bedrock, 'attack_damage');
            const pack = componentValues(subject.bedrock, 'minecraft:attack').length > 0;
            differences.push(
                `a blow deals ${low} to ${high}, where Java deals ${javaLow} to ${javaHigh}${ruling.kind === 'java' || !pack ? '' : ' (Bedrock range kept)'}`
            );
        }
        if (blow.dealt < low - 1e-6 || blow.dealt > high + 1e-6)
            differences.push(`one blow dealt ${blow.dealt}, outside the ${low} to ${high} it draws from`);

        const effect = JAVA_MELEE_EFFECTS[subject.javaId];
        if (effect === undefined && blow.effect !== undefined)
            differences.push(`a blow adds ${blow.effect.id} for ${blow.effect.seconds}s, where Java's adds nothing`);
        if (effect !== undefined && (blow.effect?.id !== effect.effect || !agrees(blow.effect.seconds, effect.seconds)))
            differences.push(
                `a blow adds ${blow.effect === undefined ? 'nothing' : `${blow.effect.id} for ${blow.effect.seconds}s`}, where Java's adds ${effect.effect} for ${effect.seconds}s`
            );
        return differences.length === 0 ? undefined : differences.join('; ');
    },
    classify: (subject, difference) => {
        const ruling = statRuling(subject.bedrock, 'attack_damage');
        // Only the damage range can be the decision's; a wrong effect or a blow outside the range is not.
        const parts = difference.split('; ');
        return ruling.kind === 'exception' && parts.every((part) => part.endsWith('(Bedrock range kept)'))
            ? { kind: 'intentional', reason: ruling.reason }
            : undefined;
    }
};

/** The `minecraft:movement.*` move controls vanilla declares. */
const MOVE_CONTROLS = ['basic', 'sway', 'hover', 'amphibious', 'jump', 'generic', 'fly', 'glide', 'skip'].map(
    (kind) => `minecraft:movement.${kind}`
);

/** The move control a type declares, in its base components or a group. */
const moveControlOf = (bedrock: string): string | undefined => {
    const declared = typeOf(bedrock).declaredComponents;
    return MOVE_CONTROLS.find((component) => declared.includes(component));
};

/** Fills a box of the shared world with one block, for a scenario that needs water around a mob. */
const fill = (from: { x: number; y: number; z: number }, size: number, height: number, block: string): void => {
    const { world } = realStack();
    for (let dx = -size; dx <= size; dx += 1)
        for (let dz = -size; dz <= size; dz += 1)
            for (let dy = 0; dy < height; dy += 1)
                world.setBlock(
                    { x: Math.floor(from.x) + dx, y: Math.floor(from.y) + dy, z: Math.floor(from.z) + dz },
                    block
                );
};

/**
 * The mobs whose Java move control never turns them toward a waypoint, with the turn Java gives
 * them for a half turn instead: a squid eases its body a tenth of the way toward its own swim
 * vector in `Squid.aiStep`, and a shulker never leaves the block it holds.
 */
const SELF_MOVING: ReadonlyMap<string, number> = new Map([
    // Squid.aiStep: yBodyRot += (target - yBodyRot) * 0.1, a tenth of a half turn.
    ['minecraft:squid', 18],
    ['minecraft:glow_squid', 18],
    ['minecraft:shulker', 0]
]);

/** How many mobs the turn scenario has run, which picks each one a fresh column. */
let turnRuns = 0;

/** Whether Java's navigator for the mob works only in water, so its move control acts only there. */
const waterBound = (entity: DataEntity): boolean =>
    entity.instance.javaNavigation?.navigationClass.endsWith('WaterBoundPathNavigation') === true;

/**
 * The turn-rate scenario: every Java move control turns the body toward the waypoint by a
 * bounded step a tick, and moves the mob along the heading it reached.
 */
const turnScenario: BehaviorScenario<EntitySubject> = {
    name: 'move-control-turn',
    java: "A mob turns toward its waypoint by at most its Java move control's step a tick (90 degrees, 10 for a smooth swimmer, at once for the vex, phantom and ghast) and moves along the heading it reached.",
    reference:
        "Java MoveControl.tick and FlyingMoveControl.tick (rotlerp(yaw, target, 90)), SmoothSwimmingMoveControl.tick (rotlerp by maxTurnY), and each mob's move control in packages/bedrock-data/src/jsp/java/26.3/entity_navigation.json",
    subjects: () =>
        MOVE_CONTROLS.flatMap((component) =>
            entitiesDeclaring(component).filter((subject) => moveControlOf(subject.bedrock) === component)
        ),
    idOf: (subject) => subject.javaId,
    aspects: (subject) => [moveControlOf(subject.bedrock) ?? 'minecraft:movement'],
    run: (subject) => {
        const { runtime } = realStack();
        // A fresh column per mob, so nothing an earlier mob left behind pushes this one.
        turnRuns += 1;
        const at = { ...slotAt(8), z: ORIGIN.z + turnRuns * 16 };
        return withSpawned(
            subject.bedrock,
            (entity) => {
                const java = entity.instance.javaNavigation;
                if (java === undefined) return `the server pins no Java navigation for ${subject.bedrock}`;
                const step = javaMoveControlTurn(java);
                const swims = waterBound(entity);
                if (swims) fill(at, 6, 8, 'minecraft:water');
                try {
                    const { moveTo } = holdWalk(entity);
                    entity.position = { ...at, y: at.y + (swims ? 2 : 0) };
                    entity.body.yaw = 0;
                    const start = entity.position;
                    // The waypoint lies straight behind the mob, a half turn away.
                    moveTo({ x: start.x, y: start.y, z: start.z - 4 }, 1);
                    runtime.tick(1);
                    const turned = Math.abs((((entity.body.yaw % 360) + 540) % 360) - 180);
                    const expected = SELF_MOVING.has(subject.javaId)
                        ? (SELF_MOVING.get(subject.javaId) ?? 0)
                        : step === undefined
                          ? 180
                          : Math.min(step, 180);
                    const moved = { x: entity.position.x - start.x, z: entity.position.z - start.z };
                    const differences: string[] = [];
                    if (Math.abs(turned - expected) > 1e-3)
                        differences.push(
                            `it turned ${turned.toFixed(2)} degrees in one tick, where Java turns ${expected}`
                        );
                    // Along a heading turned a quarter, the step is all sideways.
                    if (
                        step !== undefined &&
                        step < 180 &&
                        !SELF_MOVING.has(subject.javaId) &&
                        Math.hypot(moved.x, moved.z) > 1e-6
                    ) {
                        const along =
                            -Math.sin((entity.body.yaw * Math.PI) / 180) * moved.x +
                            Math.cos((entity.body.yaw * Math.PI) / 180) * moved.z;
                        if (along < Math.hypot(moved.x, moved.z) * 0.999)
                            differences.push(
                                'it moved off the heading it faced, where Java moves a mob along its body'
                            );
                    }
                    return differences.length === 0 ? undefined : differences.join('; ');
                } finally {
                    if (swims) fill(at, 6, 8, 'minecraft:air');
                }
            },
            at
        );
    }
};

/**
 * One test course for the path finder: a closed tunnel with a slice across it the route has to
 * enter, written as voxel layers.
 */
interface Course {
    readonly name: string;
    /** The character the slice is made of, from `VOXEL_KINDS`. */
    readonly slice: string;
    /** How tall the slice is: the whole tunnel, or a door's two blocks in a wall. */
    readonly door: boolean;
}

const COURSES: readonly Course[] = [
    { name: 'water', slice: '~', door: false },
    { name: 'lava', slice: '!', door: false },
    { name: 'a closed wooden door', slice: 'D', door: true },
    { name: 'an open door', slice: 'd', door: true }
];

/**
 * How many blocks wide Java's node evaluators take a mob to be, `floor(bbWidth + 1)`, for the
 * hitbox the server gives it. Hitboxes are the client's geometry (exclusion 5 of the parity
 * claim), so Java's rule is applied to the server's box rather than to Java's.
 */
const javaPathWidth = (entity: DataEntity): number => Math.max(1, Math.floor(entity.facts.box.width + 1));

/** The tunnel width and height a mob of this hitbox fits in, with a block to spare. */
const tunnelFor = (entity: DataEntity): { readonly width: number; readonly height: number } => {
    const box = entity.facts.box;
    return { width: Math.max(3, javaPathWidth(entity) + 2), height: Math.max(3, Math.ceil(box.height) + 1) };
};

/** A course's run along x: how long it is and where its slice stands, with room for the mob's width either side. */
const runFor = (entity: DataEntity): { readonly length: number; readonly slice: number } => {
    const width = javaPathWidth(entity);
    return { length: 11 + 2 * width, slice: 5 + width };
};

/** Builds the voxel layers of one course: a stone floor and shell around a tunnel along x. */
const courseLayers = (
    course: Course,
    width: number,
    height: number,
    medium: string,
    run: { readonly length: number; readonly slice: number }
): string[][] => {
    const layers: string[][] = [];
    for (let y = 0; y <= height + 1; y += 1) {
        const rows: string[] = [];
        for (let z = 0; z <= width + 1; z += 1) {
            let row = '';
            for (let x = 0; x < run.length; x += 1) {
                const shell = y === 0 || y === height + 1 || z === 0 || z === width + 1;
                if (shell) row += '#';
                else if (x !== run.slice) row += medium;
                else if (!course.door) row += course.slice;
                else row += z === 1 + Math.floor(width / 2) && y <= 2 ? course.slice : '#';
            }
            rows.push(row);
        }
        layers.push(rows);
    }
    return layers;
};

/** Java's verdict on whether a mob's path may enter one course's slice, from its navigation dump. */
const javaEnters = (entity: DataEntity, course: Course): boolean | undefined => {
    const java = entity.instance.javaNavigation;
    if (java === undefined) return undefined;
    const malus = java.pathfindingMalus;
    const allowed = (key: string): boolean => (malus[key] ?? 0) >= 0;
    if (course.name === 'water') return allowed('water');
    if (course.name === 'lava') return allowed('lava');
    // The node evaluators check a box floor(width + 1) by floor(height + 1) blocks, so a door
    // opening one block wide and two high takes only a mob under a block wide and two tall.
    if (course.door && (javaPathWidth(entity) > 1 || Math.floor(entity.facts.box.height + 1) > 2)) return false;
    // WalkNodeEvaluator reads a closed wooden door as walkable only for a navigator that opens doors.
    if (course.name === 'a closed wooden door')
        return java.canOpenDoors === true ? allowed('walkable_door') : allowed('door_wood_closed');
    return java.canPassDoors !== false && allowed('door_open');
};

/** The navigation components whose path finder this scenario drives. */
const NAVIGATIONS = ['walk', 'generic', 'hover', 'float', 'climb', 'fly', 'swim'].map(
    (kind) => `minecraft:navigation.${kind}`
);

/**
 * The path-finder scenario: whether the server routes the mob through water, lava, a closed
 * wooden door and an open door, against the path costs and door rules Java's navigator gives it.
 */
const navigationScenario: BehaviorScenario<EntitySubject> = {
    name: 'path-through',
    java: "A mob's path enters water, lava, a closed wooden door or an open door exactly when Java's node evaluator gives that path type a cost of zero or more for it, opening wooden doors only for a navigator that can.",
    reference:
        'Java Mob.getPathfindingMalus and WalkNodeEvaluator/NodeEvaluator canOpenDoors and canPassDoors, per mob in packages/bedrock-data/src/jsp/java/26.3/entity_navigation.json',
    subjects: () =>
        NAVIGATIONS.flatMap((component) =>
            entitiesDeclaring(component).map((subject) => ({ ...subject, tag: component }))
        ),
    idOf: (subject) => `${subject.tag}/${subject.javaId}`,
    covers: (subject) => subject.javaId,
    aspects: (subject) => [subject.tag ?? 'minecraft:navigation'],
    run: (subject) =>
        withSpawned(subject.bedrock, (entity) => {
            activate(entity, subject.tag ?? '');
            const profile = navigationProfile(entity.instance);
            const { width, height } = tunnelFor(entity);
            const run = runFor(entity);
            const mobWidth = javaPathWidth(entity);
            // The mob's footprint centered on the door's column, as a path node puts it.
            const across = 1 + Math.floor(width / 2) - Math.floor((mobWidth - 1) / 2) + mobWidth / 2;
            const differences: string[] = [];
            for (const course of COURSES) {
                const java = javaEnters(entity, course);
                if (java === undefined) return `the server pins no Java navigation for ${subject.bedrock}`;
                // A water-bound mob only lives in water, so its tunnel is flooded.
                const medium = waterBound(entity) ? '~' : '.';
                const path = findPath(voxelGrid(courseLayers(course, width, height, medium, run)), profile, {
                    from: { x: 1 + mobWidth / 2, y: 1, z: across },
                    to: { x: run.length - 1 - mobWidth / 2, y: 1, z: across },
                    maxNodes: 8192
                });
                const server = path?.reachedGoal === true;
                if (server !== java)
                    differences.push(
                        server
                            ? `the server routes it through ${course.name}, which Java's navigator refuses`
                            : `the server will not route it through ${course.name}, which Java's navigator enters`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        })
};

/**
 * The rider-control components. The server sends each as the actor flag that lets the client
 * drive the mount (`WASDControlled`, `CanPowerJump`, `CanDash`, `VerticalMovement`) exactly while
 * the component is active.
 */
const RIDER_CONTROLS: readonly string[] = [
    'minecraft:input_ground_controlled',
    'minecraft:can_power_jump',
    'minecraft:dash_action',
    'minecraft:vertical_movement_action'
];

/** The events a player's saddle or harness fires on the mob, read off its `minecraft:equippable`. */
const equipEvents = (entity: DataEntity): readonly string[] => {
    const params = entity.instance.componentParams('minecraft:equippable');
    const slots = field(params, 'slots');
    if (!Array.isArray(slots)) return [];
    return slots.flatMap((slot) => {
        const event = field(field(slot, 'onEquip') ?? field(slot, 'on_equip'), 'event');
        return typeof event === 'string' ? [event] : [];
    });
};

/**
 * The rider-control scenario: Java hands a mount's steering, its jump or dash and a happy
 * ghast's climb to the rider only once it is saddled or harnessed, and the server tells the
 * client to drive it in the same state. The ridden movement itself is client-predicted
 * (exclusion 3 of the parity claim) and not compared.
 */
const riderControlScenario: BehaviorScenario<EntitySubject> = {
    name: 'rider-controls',
    java: 'A player steers a mount, power-jumps or dashes it, or climbs a happy ghast, only once it is saddled or harnessed.',
    reference:
        'Java AbstractHorse.getControllingPassenger and canJump (isSaddled), Camel and AbstractNautilus (PlayerRideableJumping, saddled), HappyGhast.getControllingPassenger (harnessed)',
    subjects: () =>
        RIDER_CONTROLS.flatMap((component) =>
            entitiesDeclaring(component).map((subject) => ({ ...subject, tag: component }))
        ),
    idOf: (subject) => `${subject.tag}/${subject.javaId}`,
    covers: (subject) => subject.javaId,
    aspects: (subject) => [subject.tag ?? ''],
    run: (subject) => {
        const control = subject.tag ?? '';
        return withSpawned(subject.bedrock, (entity) => {
            const before = entity.instance.hasComponent(control);
            // Tame it the way a player would, then put on what its equippable slots take.
            for (const component of ['minecraft:tameable', 'minecraft:tamemount']) {
                const params = entity.instance.componentParams(component);
                // `minecraft:tameable` is parsed; `minecraft:tamemount` keeps its raw body.
                const tameEvent = field(field(params, 'tameEvent') ?? field(params, 'tame_event'), 'event');
                if (typeof tameEvent === 'string') fireNow(entity, tameEvent);
            }
            activate(entity, 'minecraft:equippable');
            for (const event of equipEvents(entity)) fireNow(entity, event);
            // A mount whose saddle or harness comes through an interaction rather than an
            // equippable slot is saddled by the events named for it.
            if (!entity.instance.hasComponent(control))
                for (const event of typeOf(subject.bedrock).entity.events.keys())
                    if (/saddled|harnessed/.test(event) && !/unsaddled|unharnessed|in_water/.test(event))
                        fireNow(entity, event);
            const after = entity.instance.hasComponent(control);
            if (before) return 'the server hands the rider control before the mount is saddled or harnessed';
            if (!after) return 'the server never hands the rider control, even saddled or harnessed';
            return undefined;
        });
    }
};

/** The Java rule each remaining movement component stands for, checked against what the server runs. */
interface ServerRule {
    readonly component: string;
    readonly java: string;
    readonly reference: string;
    /** What the server does differently, read off the server's own code, or undefined when it matches. */
    readonly check: (subject: EntitySubject) => string | undefined;
}

/** Whether the server runs anything for a component, rather than holding it as data. */
const runs = (component: string): boolean => serverContent().entities.components.hooksOf(component).size > 0;

/**
 * Whether a mob in water drifts on once it stops swimming, by the share of one tick's travel it
 * keeps the next tick, against the range Java's water drag allows.
 */
const coastDifference = (subject: EntitySubject, [low, high]: readonly [number, number]): string | undefined => {
    const { runtime } = realStack();
    const at = slotAt(4);
    fill(at, 6, 8, 'minecraft:water');
    try {
        return withSpawned(
            subject.bedrock,
            (entity) => {
                entity.position = { ...at, y: at.y + 2 };
                // Faced along the swim already, so a slow-turning swimmer does not spend the run turning.
                entity.body.yaw = -90;
                const walk = holdWalk(entity);
                walk.moveTo({ x: at.x + 6, y: at.y + 2, z: at.z }, 1);
                let last = 0;
                for (let tick = 1; tick <= 6; tick += 1) {
                    const before = entity.position.x;
                    runtime.tick(tick);
                    last = entity.position.x - before;
                }
                if (last <= 1e-4) return 'it does not swim toward its waypoint at all';
                // The walk ends the way a finished path ends it.
                walk.stopMoving();
                const before = entity.position.x;
                runtime.tick(7);
                const kept = (entity.position.x - before) / last;
                return kept >= low - 0.02 && kept <= high + 0.02
                    ? undefined
                    : `it keeps ${(kept * 100).toFixed(0)} percent of its speed the tick after it stops, where Java's water drag keeps ${low === high ? `${low * 100}` : `${low * 100} to ${high * 100}`} percent`;
            },
            { ...at, y: at.y + 2 }
        );
    } finally {
        fill(at, 6, 8, 'minecraft:air');
    }
};

/**
 * The durability one boost costs each steering item in Java, `Items`' `FoodOnAStickItem`
 * constructor arguments.
 */
const JAVA_BOOST_DAMAGE: ReadonlyMap<string, number> = new Map([
    ['minecraft:carrot_on_a_stick', 7],
    ['minecraft:warped_fungus_on_a_stick', 1]
]);

/** The server's item types with its vanilla behaviors over a world whose user rides a mount that takes a boost. */
let steeringItems: ItemRegistry | undefined;
const steeringItemRegistry = (): ItemRegistry => {
    if (steeringItems !== undefined) return steeringItems;
    const behaviors = new BehaviorRegistry<ItemHooks>();
    const items = deferredItemFactory();
    registerVanillaItemBehaviors(behaviors, { world: createTestWorld({ boosts: true }), items });
    steeringItems = loadItemTypes({ behaviors }).registry;
    items.bind(steeringItems);
    return steeringItems;
};

/** The durability the server's item behavior takes from a steering item for one boost that took. */
const boostCost = (item: string): number | undefined => {
    const stack = new ItemStack(steeringItemRegistry().holder(item), 1);
    const used = stack.type.hooks.dispatchFirst('onUse', { itemStack: stack, source: testSource(), useDuration: 0 });
    const damage = used?.stack?.get('minecraft:damage');
    return typeof damage === 'number' ? damage : undefined;
};

/** The item names a component field holds, one or a list, under their current names. */
const itemNames = (value: unknown): readonly string[] =>
    (Array.isArray(value) ? value : [value]).flatMap((name) =>
        typeof name === 'string' ? [normalizedItemIdentifier(name)] : []
    );

/**
 * Saddles a spawned pig or strider, puts a player on it holding the item it steers with, and
 * hands the three to `observe`.
 */
const withRiddenMount = (
    subject: EntitySubject,
    observe: (mount: DataEntity, player: DataEntity, item: string) => string | undefined
): string | undefined =>
    withSpawned(
        subject.bedrock,
        (mount) => {
            activate(mount, 'minecraft:item_controllable');
            activate(mount, 'minecraft:boostable');
            const item = itemNames(
                field(mount.instance.componentParams('minecraft:item_controllable'), 'control_items')
            )[0];
            if (item === undefined) return 'the saddled mount names no item it is steered with';
            return withSpawned(
                'minecraft:player',
                (player) => {
                    const { runtime, world } = realStack();
                    const seat = runtime.mobById(mount.id);
                    if (seat === undefined) return 'the runtime exposes no goal view of the mount';
                    runtime.mount(player.body, seat);
                    world.held.set(player.id, item);
                    try {
                        return observe(mount, player, item);
                    } finally {
                        world.held.delete(player.id);
                        runtime.dismount(player.body);
                    }
                },
                mount.position
            );
        },
        slotAt(7)
    );

/** How far a boat floating over a bubble column rose and sank, and whether it was taken out of its rider's control. */
interface BubbleRide {
    readonly highest: number;
    readonly lowest: number;
    readonly outOfControl: boolean;
}

/** Floats a boat on a pool over a bubble column, rising or dragging down, for 80 ticks. */
const boatOverBubbles = (bedrock: string, down: boolean): BubbleRide | string => {
    const { runtime, world } = realStack();
    const at = slotAt(9);
    const pool = { ...at, y: at.y - 4 };
    fill(pool, 2, 4, 'minecraft:water');
    for (let y = pool.y; y < at.y; y += 1)
        world.world.blocks.set(
            { x: Math.floor(at.x), y, z: Math.floor(at.z) },
            { identifier: 'minecraft:bubble_column', states: { drag_down: down } },
            false
        );
    try {
        return withSpawned(
            bedrock,
            (boat) => {
                for (let tick = 1; tick <= 10; tick += 1) runtime.tick(tick);
                const floating = boat.position.y;
                let highest = 0;
                let lowest = 0;
                let outOfControl = false;
                for (let tick = 11; tick <= 90 && boat.removed === undefined; tick += 1) {
                    runtime.tick(tick);
                    highest = Math.max(highest, boat.position.y - floating);
                    lowest = Math.min(lowest, boat.position.y - floating);
                    outOfControl ||= boat.instance.hasComponent('minecraft:out_of_control');
                }
                return { highest, lowest, outOfControl };
            },
            at
        );
    } finally {
        fill(pool, 2, 4, 'minecraft:stone');
    }
};

/**
 * What a minecart pushed at `push` blocks a tick does on a run of one rail: the share of its
 * speed it keeps over its last tick, its longest move in a tick, and how far it strays from the
 * rail.
 */
const minecartRun = (
    bedrock: string,
    rail: string,
    push: number
): { readonly kept: number; readonly fastest: number; readonly drift: number } | string => {
    const { runtime, world } = realStack();
    const at = slotAt(10);
    const run = (block: string, states: Readonly<Record<string, BlockStateValue>>) => {
        for (let dx = -2; dx <= 40; dx += 1)
            world.world.blocks.set(
                { x: Math.floor(at.x) + dx, y: at.y, z: Math.floor(at.z) },
                { identifier: block, states },
                false
            );
    };
    // East to west, and for a powered rail, powered.
    run(rail, rail === 'minecraft:rail' ? { rail_direction: 1 } : { rail_direction: 1, rail_data_bit: true });
    try {
        return withSpawned(
            bedrock,
            (cart) => {
                cart.body.push({ x: push, y: 0, z: 0 });
                const steps: number[] = [];
                for (let tick = 1; tick <= 6; tick += 1) {
                    const before = cart.position.x;
                    runtime.tick(tick);
                    steps.push(cart.position.x - before);
                }
                const [last = 0, previous = 0] = [steps.at(-1), steps.at(-2)];
                if (previous <= 1e-6) return 'a push does not move it along the rail at all';
                return { kept: last / previous, fastest: Math.max(...steps), drift: cart.position.z - at.z };
            },
            at
        );
    } finally {
        run('minecraft:air', {});
    }
};

/**
 * What a minecart does over a powered activator rail, against Java's `activateMinecart`: a
 * minecart drops its rider, a TNT minecart primes, a hopper minecart locks (the pack's
 * `minecraft:hopper_deactivate`), and a command block minecart reacts at all.
 */
const activatorReaction = (bedrock: string): string | undefined => {
    const { runtime, world } = realStack();
    const at = slotAt(11);
    const rail = { x: Math.floor(at.x), y: at.y, z: Math.floor(at.z) };
    world.world.blocks.set(
        rail,
        { identifier: 'minecraft:activator_rail', states: { rail_direction: 1, rail_data_bit: true } },
        false
    );
    try {
        return withSpawned(
            bedrock,
            (cart) => {
                const fired: string[] = [];
                const fire = cart.instance.fire.bind(cart.instance);
                cart.instance.fire = (event, ...rest) => {
                    fired.push(event);
                    return fire(event, ...rest);
                };
                const rider = bedrock === 'minecraft:minecart' ? runtime.spawn('minecraft:pig', at) : undefined;
                const seat = runtime.mobById(cart.id);
                if (rider !== undefined && seat !== undefined) runtime.mount(rider.body, seat);
                try {
                    for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);
                    if (bedrock === 'minecraft:minecart')
                        return seat !== undefined && runtime.ridersOf(cart.body).length > 0
                            ? 'it keeps its rider over a powered activator rail, where Java drops it'
                            : undefined;
                    if (bedrock === 'minecraft:tnt_minecart')
                        return cart.removed === undefined && cart.body.fuseTicks === undefined
                            ? 'it does not prime over a powered activator rail'
                            : undefined;
                    if (bedrock === 'minecraft:hopper_minecart')
                        return fired.includes('minecraft:hopper_deactivate')
                            ? undefined
                            : 'it does not lock over a powered activator rail';
                    return fired.length > 0 ? undefined : 'it does not react to a powered activator rail';
                } finally {
                    if (rider !== undefined && rider.removed === undefined)
                        runtime.remove(rider.id, 'parity stats scenario complete');
                }
            },
            { ...at, x: Math.floor(at.x) + 0.5 }
        );
    } finally {
        world.world.blocks.set(rail, { identifier: 'minecraft:air', states: {} }, false);
    }
};

/** The movement components whose Java rule each scenario exercises on the server. */
const SERVER_RULES: readonly ServerRule[] = [
    {
        component: 'minecraft:boostable',
        java: "A player steering a pig or strider with its item boosts it for 140 plus up to 840 ticks, cannot boost again until that runs out, and the item pays Java's durability for the boost: 7 for a carrot on a stick, 1 for a warped fungus on a stick.",
        reference:
            'Java FoodOnAStickItem.use (consumeItemDamage 7 and 1 in Items), ItemSteerable.boost and ItemBasedSteering.boost (140 + nextInt(841))',
        check: (subject) =>
            withRiddenMount(subject, (mount, player, item) => {
                const { runtime } = realStack();
                const differences: string[] = [];
                if (!runtime.boostMount(player.id, item)) differences.push(`a rider holding ${item} cannot boost it`);
                else {
                    const ticks = runtime.steeringOf(mount).boostTicks;
                    if (ticks < 140 || ticks > 980)
                        differences.push(`a boost lasts ${ticks} ticks, outside Java's 140 to 980`);
                    if (runtime.boostMount(player.id, item))
                        differences.push('it boosts again while a boost runs, which Java refuses');
                }
                const java = JAVA_BOOST_DAMAGE.get(item);
                const cost = boostCost(item);
                if (cost !== java)
                    differences.push(`a boost costs ${String(cost)} durability, where Java's costs ${String(java)}`);
                return differences.length === 0 ? undefined : differences.join('; ');
            })
    },
    {
        component: 'minecraft:item_controllable',
        java: 'A ridden pig or strider follows its rider only while the rider holds the item it steers with.',
        reference:
            'Java Pig.getControllingPassenger and Strider.getControllingPassenger (a player holding the steering item)',
        check: (subject) =>
            withRiddenMount(subject, (mount, player, item) => {
                const { runtime, world } = realStack();
                const differences: string[] = [];
                if (runtime.itemControllingRider(mount) !== player.id)
                    differences.push(`a rider holding ${item} does not steer it`);
                world.held.set(player.id, 'minecraft:stick');
                if (runtime.itemControllingRider(mount) !== undefined)
                    differences.push('a rider holding a stick steers it, where Java leaves it to wander');
                return differences.length === 0 ? undefined : differences.join('; ');
            })
    },
    {
        component: 'minecraft:underwater_mount_breathing',
        java: 'A nautilus gives its player rider Breath of the Nautilus in water, refreshed to 60 ticks, so the rider does not drown.',
        reference: 'Java AbstractNautilus (MobEffects.BREATH_OF_THE_NAUTILUS, 60 ticks, for the controlling player)',
        check: (subject) => {
            const at = slotAt(6);
            fill(at, 3, 4, 'minecraft:water');
            try {
                return withSpawned(
                    subject.bedrock,
                    (mount) => {
                        // A nautilus seats a rider once tamed, and breathes for it once saddled in water.
                        activate(mount, 'minecraft:rideable');
                        activate(mount, 'minecraft:underwater_mount_breathing');
                        return withSpawned(
                            'minecraft:player',
                            (player) => {
                                const { runtime } = realStack();
                                const seat = runtime.mobById(mount.id);
                                if (seat === undefined) return 'the runtime exposes no goal view of the mount';
                                runtime.mount(player.body, seat);
                                try {
                                    for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);
                                    const breath = player.body.statusEffects.get('minecraft:breath_of_the_nautilus');
                                    return breath?.durationTicks === 60
                                        ? undefined
                                        : `its rider has ${breath === undefined ? 'no Breath of the Nautilus' : `Breath of the Nautilus for ${breath.durationTicks} ticks`} in water, where Java keeps it at 60`;
                                } finally {
                                    runtime.dismount(player.body);
                                }
                            },
                            { ...at, y: at.y + 1 }
                        );
                    },
                    { ...at, y: at.y + 1 }
                );
            } finally {
                fill(at, 3, 4, 'minecraft:air');
            }
        }
    },
    {
        component: 'minecraft:out_of_control',
        java: 'A boat floating over a bubble column is taken from its rider for 60 ticks, then thrown up by one rising under it or pulled under by one dragging down.',
        reference:
            'Java BubbleColumnBlock.entityInside, AbstractBoat.onAboveBubbleColumn and AbstractBoat.tickBubbleColumn (60 ticks, then +0.6 up or -0.7 down)',
        check: (subject) =>
            [false, true]
                .flatMap((down) => {
                    const moved = boatOverBubbles(subject.bedrock, down);
                    if (typeof moved === 'string') return [moved];
                    const differences: string[] = [];
                    if (!moved.outOfControl)
                        differences.push(
                            `over a ${down ? 'downward' : 'rising'} column it stays in its rider's control`
                        );
                    if (down ? moved.lowest > -0.3 : moved.highest < 0.3)
                        differences.push(
                            `a ${down ? 'downward' : 'rising'} column moves it ${(down ? moved.lowest : moved.highest).toFixed(2)} blocks in 80 ticks, where Java ${down ? 'pulls it under' : 'throws it up'}`
                        );
                    return differences;
                })
                .join('; ') || undefined
    },
    {
        component: 'minecraft:rail_movement',
        java: 'A minecart pushed along a rail runs along it, slowed only by its rolling drag, a powered rail speeds it up, and it moves no more than 0.4 blocks a tick.',
        reference:
            'Java AbstractMinecart.moveAlongTrack and OldMinecartBehavior.moveAlongTrack (getSlowdownFactor 0.96 empty, a powered rail adds 0.06 a tick, getMaxSpeed 0.4), PoweredRailBlock',
        check: (subject) => {
            // Pushed slowly enough that six ticks of a powered rail's boost stay under the 0.4 cap.
            const plain = minecartRun(subject.bedrock, 'minecraft:rail', 0.1);
            const powered = minecartRun(subject.bedrock, 'minecraft:golden_rail', 0.1);
            const fast = minecartRun(subject.bedrock, 'minecraft:rail', 1);
            if (typeof plain === 'string') return plain;
            if (typeof powered === 'string') return powered;
            if (typeof fast === 'string') return fast;
            const differences: string[] = [];
            if (fast.fastest > 0.4 + 1e-6)
                differences.push(
                    `pushed hard it moves ${fast.fastest.toFixed(2)} blocks in a tick, where Java's moves 0.4`
                );
            if (plain.kept < 0.9)
                differences.push(
                    `on a rail it keeps ${(plain.kept * 100).toFixed(0)} percent of its speed over a tick, where Java keeps 96`
                );
            if (Math.abs(plain.drift) > 0.01) differences.push('it leaves the rail it runs along');
            if (powered.kept <= 1) differences.push('a powered rail does not speed it up');
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        component: 'minecraft:rail_sensor',
        java: 'A minecart over a powered activator rail reacts: a minecart drops its rider, a TNT minecart primes, a hopper minecart locks and a command block minecart runs.',
        reference:
            'Java AbstractMinecart.activateMinecart and its Minecart, MinecartTNT, MinecartHopper and MinecartCommandBlock overrides',
        check: (subject) => activatorReaction(subject.bedrock)
    },
    {
        component: 'minecraft:water_movement',
        java: "A mob in water keeps drifting once it stops swimming, slowed each tick by its Java water drag: 0.8, 0.98 for the polar bear, 0.9 for the turtle's own travel.",
        reference:
            'Java LivingEntity.getWaterSlowDown (0.8), PolarBear.getWaterSlowDown (0.98), Turtle.travel (scale 0.9)',
        check: (subject) => {
            const drag =
                subject.javaId === 'minecraft:polar_bear' ? 0.98 : subject.javaId === 'minecraft:turtle' ? 0.9 : 0.8;
            return coastDifference(subject, [drag, drag]);
        }
    },
    {
        component: 'minecraft:underwater_movement',
        java: "A mob in water keeps drifting once it stops swimming, slowed each tick by water drag between 0.8 (LivingEntity.travelInFluid) and 0.9 (a swimmer's own travel).",
        reference:
            'Java LivingEntity.travelInFluid (drag 0.8, or getWaterSlowDown) and the AbstractFish, Dolphin, Guardian, Turtle, Axolotl and Tadpole travel overrides (scale 0.9)',
        check: (subject) => coastDifference(subject, [0.8, 0.98])
    },
    {
        component: 'minecraft:lava_movement',
        java: 'A strider walks across a lava pool on its surface as it walks on land, and wanders about on it by its own goals, since Java floats it from Strider.tick rather than from a goal that holds it still.',
        reference:
            'Java Strider.canStandOnFluid (lava), StriderPathNavigation, which paths over lava, Strider.floatStrider, called from Strider.tick, and the RandomStrollGoal Strider.registerGoals adds',
        check: (subject) => {
            const { runtime, world } = realStack();
            const at = slotAt(5);
            const floor = (block: string) => {
                for (let dx = -12; dx <= 12; dx += 1)
                    for (let dz = -12; dz <= 12; dz += 1)
                        world.setBlock({ x: Math.floor(at.x) + dx, y: 63, z: Math.floor(at.z) + dz }, block);
            };
            floor('minecraft:lava');
            try {
                const differences: string[] = [];
                // An adult, since a strider's own spawn event may make a baby, which walks at half the speed.
                const events = typeOf(subject.bedrock).entity.events;
                const adult = ['minecraft:spawn_adult', 'spawn_adult'].find((event) => events.has(event));
                const spawnAdult = (): DataEntity => {
                    const entity = runtime.spawn(subject.bedrock, at, adult === undefined ? {} : { event: adult });
                    if (entity === undefined) throw new Error(`the server spawned no ${subject.bedrock}`);
                    return entity;
                };
                const walker = spawnAdult();
                try {
                    // Walked toward a spot across the pool every tick, as a goal that walks it would.
                    for (let tick = 1; tick <= 20; tick += 1) {
                        walker.body.moveTo({ x: at.x + 8, y: at.y, z: at.z }, 1);
                        runtime.tick(tick);
                    }
                    if (walker.position.y < 63.5)
                        differences.push('it sinks into the lava, where Java stands it on the surface');
                    // Java's ground travel moves a strider at its 0.175 speed about 0.037 blocks a
                    // tick once up to speed (0.175 x 0.175 x 0.546 / 0.454), so it covers well over
                    // half a block in its first second.
                    const moved = walker.position.x - at.x;
                    if (moved < 0.5)
                        differences.push(
                            `it covers ${moved.toFixed(2)} blocks of lava in a second, where Java walks it across`
                        );
                } finally {
                    runtime.remove(walker.id, 'parity stats scenario complete');
                }
                // Left to its own goals, Java's strider strolls about the pool: RandomStrollGoal starts
                // on a 1 in reducedTickDelay(60) chance a goal update. The shared stack draws a fixed
                // 0.5, so this runs in the goal probe's stack on a long seeded run of draws, whose
                // start no earlier scenario decides, with a player 16 blocks off to keep
                // noActionTime at 0 as Java's Mob.checkDespawn does.
                const adultGroups = [...typeOf(subject.bedrock).groups.keys()].filter(
                    (group) => /adult|unsaddled|pathing/.test(group) && !/jockey/.test(group)
                );
                const wandered = withProbe(
                    subject.bedrock,
                    {
                        groups: adultGroups,
                        without: (group) => /baby|jockey/.test(group),
                        random: seededDraws(4_093)
                    },
                    (probe) => {
                        probe.fill([-12, -2, -12], [12, -2, 12], 'minecraft:stone');
                        probe.fill([-12, -1, -12], [12, -1, 12], 'minecraft:lava');
                        probe.player(0, 0, 16);
                        const start = probe.at(0, 0, 0);
                        let farthest = 0;
                        for (let tick = 0; tick < 600; tick += 1) {
                            probe.tick();
                            const { x, z } = probe.entity.position;
                            farthest = Math.max(farthest, Math.hypot(x - start.x, z - start.z));
                        }
                        return farthest;
                    }
                );
                if (wandered < 1)
                    differences.push(
                        `left on the lava for 600 ticks it wanders ${wandered.toFixed(2)} blocks, where Java's RandomStrollGoal walks it about`
                    );
                return differences.length === 0 ? undefined : differences.join('; ');
            } finally {
                floor('minecraft:stone');
            }
        }
    }
];

/** The scenarios for the server rules above, one per component, over every entity that declares it. */
const serverRuleScenarios: readonly BehaviorScenario<EntitySubject>[] = SERVER_RULES.map((rule) => ({
    name: `java-rule-${rule.component.replace('minecraft:', '').replace('.', '-')}`,
    java: rule.java,
    reference: rule.reference,
    subjects: () => entitiesDeclaring(rule.component),
    idOf: (subject) => subject.javaId,
    aspects: () => [rule.component],
    run: (subject) => rule.check(subject)
}));

/** How many llamas the strength scenario spawns, enough to tell a 2 percent tail from Java's 0.8. */
const STRENGTH_SAMPLES = 20_000;

/**
 * Java's chance of each llama strength: `Llama.setRandomStrength` caps the draw at 5 one time in
 * 25 and at 3 otherwise, then rolls `1 + nextInt(cap)`.
 */
const javaStrengthChance = (strength: number): number => (strength <= 3 ? 0.96 / 3 : 0) + 0.04 / 5;

/** The llama-strength scenario: the spread of strengths a spawned llama gets against Java's draw. */
const strengthScenario: BehaviorScenario<EntitySubject> = {
    name: 'spawn-strength',
    java: 'A llama spawns with strength 1 to 3, or 1 to 5 one time in 25: 32.8 percent each for 1, 2 and 3 and 0.8 percent each for 4 and 5.',
    reference: 'Java Llama.setRandomStrength (nextFloat() < 0.04 ? 5 : 3, then 1 + nextInt)',
    subjects: () => entitiesDeclaring('minecraft:strength'),
    idOf: (subject) => subject.javaId,
    aspects: () => ['minecraft:strength'],
    run: (subject) => {
        // The server's resolved types, which carry the strength chances it loads the pack with.
        const { types } = serverContent().entities;
        const random = new LegacyRandomSource(1234n);
        const counts = new Map<number, number>();
        for (let sample = 0; sample < STRENGTH_SAMPLES; sample += 1) {
            const entity = types.spawn(subject.bedrock, {
                environment: { random: { next: () => random.nextFloat() } }
            });
            const strength = field(entity.componentParams('minecraft:strength'), 'value');
            if (typeof strength !== 'number') continue;
            counts.set(strength, (counts.get(strength) ?? 0) + 1);
        }
        const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
        if (total === 0) return 'no spawned llama carries a strength';
        const result = chiSquaredTest(
            [1, 2, 3, 4, 5].map((strength) => ({
                label: `strength ${strength}`,
                observed: counts.get(strength) ?? 0,
                expected: total * javaStrengthChance(strength)
            }))
        );
        if (result.pValue >= 0.001) return undefined;
        const shares = [1, 2, 3, 4, 5].map(
            (strength) => `${strength}: ${(((counts.get(strength) ?? 0) / total) * 100).toFixed(1)}%`
        );
        return `the server's strengths spread ${shares.join(', ')}, where Java's are 32.8% for 1 to 3 and 0.8% for 4 and 5 (p ${result.pValue.toExponential(1)})`;
    }
};

/**
 * The attack-cooldown scenario. The four mobs that declare `minecraft:attack_cooldown` are
 * Java brain mobs, whose wait between attacks or hunts Java's brain decides (GoatAi's
 * TIME_BETWEEN_RAMS of 600 to 6000 ticks, PiglinAi's TIME_BETWEEN_HUNTS of 30 to 120 seconds,
 * the axolotl's 2400-tick HAS_HUNTING_COOLDOWN and the hoglin's 40-tick melee cooldown), not
 * Bedrock's component. The server matches Java while it runs the mob on its Java brain and no
 * component hook reads Bedrock's number.
 */
const attackCooldownScenario: BehaviorScenario<EntitySubject> = {
    name: 'attack-cooldown-brain',
    java: "A goat, piglin, axolotl or hoglin waits between attacks as its Java brain says, which Bedrock's attack_cooldown does not override.",
    reference:
        'Java GoatAi.TIME_BETWEEN_RAMS, PiglinAi.TIME_BETWEEN_HUNTS, Axolotl HAS_HUNTING_COOLDOWN (2400 ticks) and HoglinAi melee cooldown (40 ticks)',
    subjects: () => entitiesDeclaring('minecraft:attack_cooldown'),
    idOf: (subject) => subject.javaId,
    aspects: () => ['minecraft:attack_cooldown'],
    run: (subject) => {
        const brain = withSpawned(subject.bedrock, (entity) => entity.brain !== undefined);
        if (!brain)
            return 'the server runs it without its Java brain, so nothing decides its attack cooldown as Java does';
        return runs('minecraft:attack_cooldown')
            ? "the server runs Bedrock's attack_cooldown beside the Java brain"
            : undefined;
    }
};

/**
 * Wraps a view so the floor along one row reads as a path block, which `minecraft:preferred_path`
 * would make a mob go out of its way for.
 */
const withPathRow = (view: NavigationView, row: number, block: string): NavigationView => ({
    ...view,
    blockAt: (position) => (position.y === 0 && position.z === row ? block : view.blockAt(position))
});

/**
 * The preferred-path scenario. Java's node evaluator costs every walkable block alike, so a golem
 * or villager walks the short way past a dirt path, and a mob with no target drops at most three
 * blocks (`Mob.getMaxFallDistance`).
 */
const preferredPathScenario: BehaviorScenario<EntitySubject> = {
    name: 'path-preference',
    java: 'A mob takes the shortest walkable route whatever the blocks underfoot, and drops at most three blocks on a path while it has no target.',
    reference:
        'Java WalkNodeEvaluator (PathType.WALKABLE costs 0 for every floor block) and Mob.getMaxFallDistance (3 without a target)',
    subjects: () => entitiesDeclaring('minecraft:preferred_path'),
    idOf: (subject) => subject.javaId,
    aspects: () => ['minecraft:preferred_path'],
    run: (subject) =>
        withSpawned(subject.bedrock, (entity) => {
            const profile = navigationProfile(entity.instance);
            const height = tunnelFor(entity).height;
            const width = javaPathWidth(entity);
            const differences: string[] = [];
            // A room seven rows deep and eleven long inside its walls, with a dirt path along its far side.
            const room: string[][] = [];
            for (let y = 0; y <= height + 1; y += 1)
                room.push(
                    Array.from({ length: 9 }, (_, z) =>
                        y === 0 || y === height + 1 || z === 0 || z === 8 ? '#'.repeat(13) : `#${'.'.repeat(11)}#`
                    )
                );
            const view = withPathRow(voxelGrid(room), 7, 'minecraft:grass_path');
            const path = findPath(view, profile, {
                from: { x: 1 + width / 2, y: 1, z: 1 + width / 2 },
                to: { x: 12 - width / 2, y: 1, z: 1 + width / 2 },
                maxNodes: 4096
            });
            if (path === undefined) differences.push('it finds no route across an open room');
            else if (path.nodes.some((node) => node.z > 2))
                differences.push('it goes out of its way onto the path blocks, where Java walks straight');

            // A mob wider than a block cannot step off a ledge one block at a time in Java either:
            // the node evaluator reads its whole footprint while it falls, and the ledge is under
            // part of it. So the drops are put to the one-block mobs.
            for (const [drop, java] of width > 1
                ? []
                : ([
                      [3, true],
                      [4, false]
                  ] as const)) {
                // A ledge two blocks wide beside a pit `drop` blocks deep, with head room over both.
                const cliff: string[][] = [];
                for (let y = 0; y <= drop + height + 1; y += 1) {
                    const middle = y === 0 || y === drop + height + 1 ? '#####' : y <= drop ? '#.###' : '#...#';
                    cliff.push(['#####', middle, '#####']);
                }
                const route = findPath(voxelGrid(cliff), profile, {
                    from: { x: 3.5, y: drop + 1, z: 1.5 },
                    to: { x: 1.5, y: 1, z: 1.5 },
                    maxNodes: 4096
                });
                const server = route?.reachedGoal === true;
                if (server !== java)
                    differences.push(
                        server
                            ? `it paths down a ${drop}-block drop, which Java refuses`
                            : `it will not path down a ${drop}-block drop, which Java takes`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        })
};

/** Every scenario of this module, before its open gaps are named. */
const scenarios: readonly BehaviorScenario<EntitySubject>[] = [
    ...STAT_ASPECTS.map(statScenario),
    attackScenario,
    turnScenario,
    navigationScenario,
    riderControlScenario,
    strengthScenario,
    attackCooldownScenario,
    preferredPathScenario,
    ...serverRuleScenarios
];

/** The issues that track the differences each scenario still finds, which its gap rows cite. */
const OPEN_GAPS: Readonly<Record<string, string>> = {
    'move-control-turn': 'issue #3140',
    'path-through': 'issues #3140 and #3181'
};

/** The scenarios that compare what an entity spawns with, and how it moves, against Java. */
export const statsScenarios: readonly BehaviorScenario<EntitySubject>[] = scenarios.map((scenario) => {
    const gaps = OPEN_GAPS[scenario.name];
    return gaps === undefined ? scenario : { ...scenario, reference: `${scenario.reference}; ${gaps}` };
});
