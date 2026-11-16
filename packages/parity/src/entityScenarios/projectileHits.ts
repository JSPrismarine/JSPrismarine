import type { EntityPosition } from '@jsprismarine/entities';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { FLOOR_Y, TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import type { JavaOperation } from '../javaClassFile.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import { serverContent } from '../serverStack.ts';
import { javaEntityClassName, javaMethodOf, numberBeforeWrite, numberNear } from './javaEntityCode.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring } from './subjects.ts';

/**
 * What a projectile does when it hits: the damage, knockback, effects and fire it deals an entity,
 * what happens to its thrower, and what is left of it after it meets an entity or a block.
 *
 * The probes run on a runtime of their own over the shared content, with a world random a probe
 * sets: every draw returns the one value the probe chose, so a chance Java rolls can be probed on
 * either side of its threshold. Nothing there runs goals, so a target stays where it is put.
 */

/** The draws the probe world's random replays; a probe fills it with one value. */
const draws: number[] = [0.5];

interface HitStage {
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
}

let built: HitStage | undefined;
let clock = 0;

const hitStage = (): HitStage => {
    if (built !== undefined) return built;
    const world = new TestEntityWorld({ random: draws, skyLight: true });
    const runtime = new EntityRuntime({
        content: serverContent,
        world: world.world,
        host: world.host,
        report: () => undefined
    });
    built = { runtime, world };
    return built;
};

/** Makes every draw of the probe world's random return `value`. */
const drawAlways = (value: number): void => {
    draws.length = 1;
    draws[0] = value;
};

const tickStage = (): void => {
    clock += 1;
    hitStage().world.advance();
    hitStage().runtime.tick(clock);
};

/** Where a probe stands its target: on the stone floor, far from the other probes' leftovers. */
let lane = 0;
const nextOrigin = (): EntityPosition => {
    lane += 1;
    return { x: 10_000 + lane * 64 + 0.5, y: FLOOR_Y + 1, z: 0.5 };
};

/** Removes everything within reach of a probe's origin. */
const clearAround = (origin: EntityPosition): void => {
    const { runtime } = hitStage();
    for (const left of runtime.inBox(
        { x: origin.x - 24, y: origin.y - 8, z: origin.z - 24 },
        { x: origin.x + 24, y: origin.y + 24, z: origin.z + 24 }
    ))
        if (runtime.byId(left.id) !== undefined) runtime.remove(left.id, 'parity probe complete');
};

/** What one projectile did to the entity in its path and to its thrower. */
export interface ProjectileHit {
    /** Health the projectile's own blow took off the target, explosions apart. */
    readonly damage: number;
    /** The target's velocity at the end of the tick it was hit, which is the knockback on a body at rest. */
    readonly knockback: { readonly horizontal: number; readonly vertical: number };
    /** The status effects the target carries afterwards, by id, with their duration and amplifier. */
    readonly effects: ReadonlyMap<string, { readonly duration: number; readonly amplifier: number }>;
    /** The target's fire ticks afterwards. */
    readonly fireTicks: number;
    /** Whether the projectile is gone a tick after the hit. */
    readonly removed: boolean;
    /** The types the hit spawned, area effect clouds and experience orbs among them. */
    readonly spawned: readonly string[];
    /** The experience the orbs it dropped carry. */
    readonly experience: number;
    /** The radius and duration of each area effect cloud it left. */
    readonly clouds: readonly { readonly radius: unknown; readonly duration: unknown }[];
    /** How far the thrower was moved, and the health it lost. */
    readonly owner?: { readonly travelled: number; readonly lost: number };
}

/** How a probe throws: what at, from whom, and how fast. */
interface HitProbe {
    /** The Bedrock type the projectile is thrown at. */
    readonly target: string;
    /** The Bedrock type that threw it, or `player` for a store player, or undefined for none. */
    readonly owner?: string;
    /** The projectile's speed along +x. */
    readonly speed: number;
    /** What every draw of the world random returns during the probe. */
    readonly draw?: number;
    /** The projectile's spawn data, such as a thrown potion's contents. */
    readonly data?: Readonly<Record<string, unknown>>;
}

const OWNER_PLAYER_ID = 900_001;

/** The causes an explosion deals, which a probe of the projectile's own blow leaves out. */
const EXPLOSION_CAUSES: ReadonlySet<string> = new Set(['entity_explosion', 'block_explosion']);

/**
 * Throws a projectile at a target standing on the floor and watches the tick it lands.
 * @returns What it did, or a sentence saying the probe could not be set up.
 */
export const probeProjectileHit = (projectile: string, probe: HitProbe): ProjectileHit | string => {
    const { runtime, world } = hitStage();
    drawAlways(probe.draw ?? 0.5);
    const origin = nextOrigin();
    try {
        const target = runtime.spawn(probe.target, origin);
        if (target === undefined) return `the server does not spawn ${probe.target}`;
        if (target.instance.hasComponent('minecraft:is_baby')) {
            target.instance.fire('minecraft:ageable_grow_up');
            target.instance.applyQueuedEvents();
        }
        const start = { x: origin.x - 2.5, y: origin.y + 0.5, z: origin.z };
        const owner =
            probe.owner === undefined
                ? undefined
                : probe.owner === 'player'
                  ? runtime.spawnPlayer(OWNER_PLAYER_ID, { x: origin.x - 8, y: origin.y, z: origin.z + 4 })
                  : runtime.spawn(probe.owner, { x: origin.x - 8, y: origin.y, z: origin.z + 4 });
        if (probe.owner !== undefined && owner === undefined) return `the server does not spawn ${probe.owner}`;
        const ownerHealth = owner?.instance.attributes.get('health')?.current;
        const ownerStart = owner === undefined ? undefined : { ...owner.position };
        const shot = runtime.spawn(projectile, start, {
            ...(owner === undefined ? {} : { ownerId: owner.id }),
            ...(probe.data === undefined ? {} : { data: probe.data })
        });
        if (shot === undefined) return `the server does not spawn ${projectile}`;
        shot.body.velocity = { x: probe.speed, y: 0, z: 0 };
        target.body.velocity = { x: 0, y: 0, z: 0 };
        const before = new Set(
            runtime
                .inBox(
                    { x: origin.x - 24, y: origin.y - 8, z: origin.z - 24 },
                    { x: origin.x + 24, y: origin.y + 24, z: origin.z + 24 }
                )
                .map((entity) => entity.id)
        );

        const commits = world.commits.length;
        let knockback = { horizontal: 0, vertical: 0 };
        for (let tick = 1; tick <= 6; tick += 1) {
            tickStage();
            const hit = world.commits.slice(commits).some((commit) => commit.target.id === target.id);
            const moved =
                Math.hypot(target.body.velocity.x, target.body.velocity.z) > 1e-6 || target.body.velocity.y > 1e-6;
            if (hit || moved) {
                knockback = {
                    horizontal: Math.hypot(target.body.velocity.x, target.body.velocity.z),
                    vertical: target.body.velocity.y
                };
                break;
            }
            if (runtime.byId(shot.id) === undefined) break;
        }
        tickStage();
        const damage = world.commits
            .slice(commits)
            .filter((commit) => commit.target.id === target.id && !EXPLOSION_CAUSES.has(commit.intent.cause))
            .reduce((sum, commit) => sum + commit.taken, 0);
        const fresh = runtime
            .inBox(
                { x: origin.x - 24, y: origin.y - 8, z: origin.z - 24 },
                { x: origin.x + 24, y: origin.y + 24, z: origin.z + 24 }
            )
            .filter((entity) => !before.has(entity.id));
        const spawned = fresh.map((entity) => entity.identifier);
        const experience = fresh.reduce((sum, entity) => {
            const value = entity.spawnData?.['value'];
            return sum + (entity.identifier === 'minecraft:xp_orb' && typeof value === 'number' ? value : 0);
        }, 0);
        const effects = new Map(
            [...target.body.statusEffects.values()].map((effect) => [
                effect.id,
                { duration: effect.durationTicks, amplifier: effect.amplifier }
            ])
        );
        const clouds = fresh.flatMap((entity) =>
            entity.identifier === 'minecraft:area_effect_cloud'
                ? [{ radius: entity.spawnData?.['radius'], duration: entity.spawnData?.['duration'] }]
                : []
        );
        return {
            damage,
            knockback,
            clouds,
            effects,
            fireTicks: target.body.fireTicks,
            removed: runtime.byId(shot.id) === undefined,
            spawned,
            experience,
            ...(owner === undefined
                ? {}
                : {
                      owner: {
                          travelled: Math.hypot(
                              owner.position.x - (ownerStart?.x ?? 0),
                              owner.position.z - (ownerStart?.z ?? 0)
                          ),
                          lost: (ownerHealth ?? 0) - (owner.instance.attributes.get('health')?.current ?? 0)
                      }
                  })
        };
    } finally {
        clearAround(origin);
    }
};

/** What a projectile does when it flies into a wall: sticks, stays, breaks or explodes. */
export const probeProjectileBlockHit = (projectile: string, speed: number): string => {
    const { runtime, world } = hitStage();
    drawAlways(0.5);
    const origin = nextOrigin();
    const wall = { x: Math.floor(origin.x) + 2, z: Math.floor(origin.z) };
    try {
        for (const dy of [0, 1, 2, 3])
            for (const dz of [-1, 0, 1])
                world.setBlock({ x: wall.x, y: Math.floor(origin.y) + dy, z: wall.z + dz }, 'minecraft:stone');
        const shot = runtime.spawn(projectile, { x: origin.x - 1, y: origin.y + 1.5, z: origin.z });
        if (shot === undefined) return `the server does not spawn ${projectile}`;
        shot.body.velocity = { x: speed, y: 0, z: 0 };
        const commits = world.commits.length;
        const explosions = world.levelEvents.length + world.sounds.length;
        for (let tick = 1; tick <= 8; tick += 1) tickStage();
        const live = runtime.byId(shot.id);
        const exploded =
            world.commits.slice(commits).some((commit) => EXPLOSION_CAUSES.has(commit.intent.cause)) ||
            world.sounds.slice(explosions).some((sound) => sound.includes('explode'));
        if (exploded) return 'explodes';
        if (live === undefined) return 'breaks';
        const resting = Math.hypot(live.body.velocity.x, live.body.velocity.y, live.body.velocity.z) < 1e-3;
        return live.body.projectileStuck || resting ? 'sticks' : 'flies on';
    } finally {
        for (const dy of [0, 1, 2, 3])
            for (const dz of [-1, 0, 1])
                world.setBlock({ x: wall.x, y: Math.floor(origin.y) + dy, z: wall.z + dz }, 'minecraft:air');
        clearAround(origin);
    }
};

/** The class a Java projectile type runs. */
const projectileClass = (javaId: string): string => javaEntityClassName(javaId);

/** The code of one method a Java projectile class declares or inherits. */
const projectileMethod = (javaId: string, method: string) => {
    const found = javaMethodOf(projectileClass(javaId), method);
    if (found === undefined) throw new Error(`${projectileClass(javaId)} has no ${method}`);
    return found.method;
};

/** A number a Java projectile's method pushes beside a call, or a throw naming what is missing. */
const pushedBeside = (javaId: string, method: string, call: string, side: 'before' | 'after'): number => {
    const value = numberNear(projectileMethod(javaId, method), call, side);
    if (value === undefined) throw new Error(`${javaId} ${method} pushes no number ${side} ${call}`);
    return value;
};

/** The numbers a method pushes right after it reads a field, such as `MobEffects.LEVITATION` and its 200 ticks. */
const numbersAfterField = (javaId: string, method: string, field: string, count: number): readonly number[] => {
    const operations = javaOperations(projectileMethod(javaId, method));
    const at = operations.findIndex(
        (operation: JavaOperation) => operation.kind === 'field' && operation.target === field
    );
    if (at < 0) throw new Error(`${javaId} ${method} reads no ${field}`);
    return operations
        .slice(at + 1)
        .flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []))
        .slice(0, count);
};

/** The numbers a Java projectile's method pushes, in order. */
const pushedNumbersOf = (javaId: string, method: string): readonly number[] =>
    javaOperations(projectileMethod(javaId, method)).flatMap((operation) =>
        operation.kind === 'number' ? [operation.value] : []
    );

/** Whether a Java projectile's `onHitEntity` hurts what it hits, which is what pushes it back. */
const javaHurtsOnHit = (javaId: string): boolean =>
    projectileMethod(javaId, 'onHitEntity').calls.some((call) => /\.(hurt|hurtServer|hurtOrSimulate)$/.test(call));

/** `AbstractArrow.baseDamage`, which its constructor sets. */
const javaArrowBaseDamage = (): number => {
    for (const method of pinnedJavaClass('net/minecraft/world/entity/projectile/arrow/AbstractArrow').filter(
        (candidate) => candidate.name === '<init>'
    )) {
        const value = numberBeforeWrite(method, 'AbstractArrow.baseDamage');
        if (value !== undefined) return value;
    }
    throw new Error('AbstractArrow sets no baseDamage');
};

/** `Snowball.onHitEntity`: `entity instanceof Blaze ? 3 : 0`, the two numbers after it reads the entity. */
const snowballDamage = (blaze: boolean): number => {
    const operations = javaOperations(projectileMethod('minecraft:snowball', 'onHitEntity'));
    const at = operations.findIndex(
        (operation) => operation.kind === 'call' && operation.target.endsWith('.getEntity')
    );
    const [ifBlaze, otherwise] = operations
        .slice(at + 1)
        .flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []));
    if (at < 0 || ifBlaze === undefined || otherwise === undefined)
        throw new Error('Snowball.onHitEntity pushes no damage');
    return blaze ? ifBlaze : otherwise;
};

/** A thrown water bottle's spawn data, its `minecraft:potion_contents`. */
const WATER_BOTTLE = { 'minecraft:potion_contents': { potion: 'minecraft:water' } } as const;

/** A thrown potion of Slowness's spawn data. */
const SLOWNESS = { 'minecraft:potion_contents': { potion: 'minecraft:slowness' } } as const;

/**
 * The ticks one of Java's potions lasts, read from `Potions.<clinit>`: the first number after the
 * effect its registration names.
 */
const javaPotionTicks = (potion: string): number => {
    const operations = javaOperations(
        pinnedJavaClass('net/minecraft/world/item/alchemy/Potions').find((method) => method.name === '<clinit>') ?? {
            instructions: []
        }
    );
    const named = operations.findIndex((operation) => operation.kind === 'string' && operation.value === potion);
    const effect = operations.findIndex(
        (operation, index) => index > named && operation.kind === 'field' && operation.target.startsWith('MobEffects.')
    );
    const ticks = operations.slice(effect + 1).find((operation) => operation.kind === 'number');
    if (named < 0 || ticks?.kind !== 'number') throw new Error(`Java registers no ${potion} potion`);
    return ticks.value;
};

/** `WitherSkull.onHitEntity`'s Wither on normal difficulty, owned or not: 10 seconds of Wither II. */
const javaWitherSkullEffect = (): { readonly id: string; readonly duration: number; readonly amplifier: number } => {
    const [seconds] = numbersAfterField('minecraft:wither_skull', 'onHitEntity', 'Difficulty.NORMAL', 1);
    const [perSecond, amplifier] = numbersAfterField('minecraft:wither_skull', 'onHitEntity', 'MobEffects.WITHER', 2);
    return { id: 'minecraft:wither', duration: (seconds ?? 0) * (perSecond ?? 0), amplifier: amplifier ?? 0 };
};

/** The speed the hit probes throw at, which an arrow's blow scales with. */
const PROBE_SPEED = 1.3;

/** One throw and what Java does with it. */
interface JavaHitProbe {
    readonly label: string;
    readonly probe: HitProbe;
    /** The health Java's blow takes off the target. */
    readonly damage: () => number;
    /** Whether Java's blow pushes the target, and whether an explosion adds to it. */
    readonly knockback: 'blow' | 'blow and blast' | 'none';
    /** The effect Java gives the target. */
    readonly effect?: () => { readonly id: string; readonly duration: number; readonly amplifier: number };
    /** The fire ticks Java sets the target alight for. */
    readonly fire?: () => number;
    /** Whether Java discards the projectile on the hit. */
    readonly removed: boolean;
    /** The cloud Java leaves, radius and duration. */
    readonly cloud?: () => { readonly radius: number; readonly duration: number };
    /** The experience Java drops. */
    readonly experience?: () => number;
    /** The health Java's landing takes off the thrower, which it takes to where the projectile was. */
    readonly teleportsOwner?: () => number;
}

/** What each vanilla projectile does to what it hits, by Java type, from the class that hits. */
const JAVA_PROJECTILE_HITS: Readonly<Record<string, readonly JavaHitProbe[]>> = {
    'minecraft:arrow': [
        {
            label: 'an arrow at 1.3 blocks a tick',
            probe: { target: 'minecraft:cow', owner: 'minecraft:pillager', speed: PROBE_SPEED },
            damage: () => Math.ceil(PROBE_SPEED * javaArrowBaseDamage()),
            knockback: 'blow',
            removed: true
        }
    ],
    'minecraft:trident': [
        {
            label: 'a trident',
            probe: { target: 'minecraft:cow', owner: 'minecraft:drowned', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:trident', 'onHitEntity', '.getEntity', 'after'),
            knockback: 'blow',
            removed: false
        }
    ],
    'minecraft:snowball': [
        {
            label: 'a snowball at a cow',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED },
            damage: () => snowballDamage(false),
            knockback: 'blow',
            removed: true
        },
        {
            label: 'a snowball at a blaze',
            probe: { target: 'minecraft:blaze', speed: PROBE_SPEED },
            damage: () => snowballDamage(true),
            knockback: 'blow',
            removed: true
        }
    ],
    'minecraft:egg': [
        {
            label: 'an egg',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:egg', 'onHitEntity', 'DamageSources.thrown', 'after'),
            knockback: 'blow',
            removed: true
        }
    ],
    'minecraft:ender_pearl': [
        {
            label: "a player's ender pearl",
            probe: { target: 'minecraft:cow', owner: 'player', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:ender_pearl', 'onHitEntity', 'DamageSources.thrown', 'after'),
            knockback: 'blow',
            removed: true,
            teleportsOwner: () => pushedBeside('minecraft:ender_pearl', 'onHit', 'DamageSources.enderPearl', 'after')
        }
    ],
    'minecraft:fireball': [
        {
            label: "a ghast's fireball",
            probe: { target: 'minecraft:cow', owner: 'minecraft:ghast', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:fireball', 'onHitEntity', 'DamageSources.fireball', 'after'),
            knockback: 'blow and blast',
            removed: true
        }
    ],
    'minecraft:small_fireball': [
        {
            label: "a blaze's fireball",
            probe: { target: 'minecraft:cow', owner: 'minecraft:blaze', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:small_fireball', 'onHitEntity', 'DamageSources.fireball', 'after'),
            knockback: 'blow',
            fire: () => pushedBeside('minecraft:small_fireball', 'onHitEntity', '.igniteForSeconds', 'before') * 20,
            removed: true
        }
    ],
    'minecraft:llama_spit': [
        {
            label: "a llama's spit",
            probe: { target: 'minecraft:cow', owner: 'minecraft:llama', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:llama_spit', 'onHitEntity', 'DamageSources.spit', 'after'),
            knockback: 'blow',
            removed: true
        },
        {
            label: 'spit no llama spat',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED },
            // LlamaSpit.onHitEntity hurts only when its owner is a living llama.
            damage: () => 0,
            knockback: 'none',
            removed: true
        }
    ],
    'minecraft:shulker_bullet': [
        {
            label: "a shulker's bullet",
            probe: { target: 'minecraft:cow', owner: 'minecraft:shulker', speed: PROBE_SPEED },
            damage: () =>
                pushedBeside('minecraft:shulker_bullet', 'onHitEntity', 'DamageSources.mobProjectile', 'after'),
            knockback: 'blow',
            effect: () => ({
                id: 'minecraft:levitation',
                duration:
                    numbersAfterField('minecraft:shulker_bullet', 'onHitEntity', 'MobEffects.LEVITATION', 1)[0] ?? 0,
                amplifier: 0
            }),
            removed: true
        }
    ],
    'minecraft:wither_skull': [
        {
            label: "a wither's skull",
            probe: { target: 'minecraft:cow', owner: 'minecraft:wither', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:wither_skull', 'onHitEntity', 'DamageSources.witherSkull', 'after'),
            knockback: 'blow and blast',
            effect: () => javaWitherSkullEffect(),
            removed: true
        },
        {
            label: 'a skull no wither shot',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:wither_skull', 'onHitEntity', 'DamageSources.magic', 'after'),
            knockback: 'blow and blast',
            effect: () => javaWitherSkullEffect(),
            removed: true
        }
    ],
    'minecraft:dragon_fireball': [
        {
            label: "a dragon's fireball",
            probe: { target: 'minecraft:cow', owner: 'minecraft:ender_dragon', speed: PROBE_SPEED },
            damage: () => 0,
            knockback: 'none',
            removed: true,
            cloud: () => ({
                radius: pushedBeside('minecraft:dragon_fireball', 'onHit', 'AreaEffectCloud.setRadius', 'before'),
                duration: pushedBeside('minecraft:dragon_fireball', 'onHit', 'AreaEffectCloud.setDuration', 'before')
            })
        }
    ],
    'minecraft:wind_charge': [
        {
            label: 'a wind charge',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED },
            damage: () => pushedBeside('minecraft:wind_charge', 'onHitEntity', 'DamageSources.windCharge', 'after'),
            knockback: 'blow and blast',
            removed: true
        }
    ],
    'minecraft:breeze_wind_charge': [
        {
            label: "a breeze's wind charge",
            probe: { target: 'minecraft:cow', owner: 'minecraft:breeze', speed: PROBE_SPEED },
            damage: () =>
                pushedBeside('minecraft:breeze_wind_charge', 'onHitEntity', 'DamageSources.windCharge', 'after'),
            knockback: 'blow and blast',
            removed: true
        }
    ],
    'minecraft:experience_bottle': [
        {
            label: "a bottle o' enchanting, every draw 0.15",
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED, draw: 0.15 },
            damage: () => 0,
            knockback: 'none',
            removed: true,
            // ThrownExperienceBottle.onHit: 3 + nextInt(5) + nextInt(5), each nextInt(5) of 0.15 being 0.
            experience: () => 3 + 2 * Math.floor(0.15 * 5)
        },
        {
            label: "a bottle o' enchanting, every draw 0.5",
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED, draw: 0.5 },
            damage: () => 0,
            knockback: 'none',
            removed: true,
            experience: () => 3 + 2 * Math.floor(0.5 * 5)
        }
    ],
    'minecraft:fishing_bobber': [
        {
            label: 'a fishing hook',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED },
            damage: () => 0,
            knockback: 'none',
            removed: false
        }
    ],
    'minecraft:splash_potion': [
        {
            label: 'a splash water bottle at a blaze',
            probe: { target: 'minecraft:blaze', speed: PROBE_SPEED, data: WATER_BOTTLE },
            // AbstractThrownPotion.affectEntitiesAround hurts a water-sensitive mob indirect magic 1 for a
            // potion in the hurts_water_sensitive_entities tag, which is water.
            damage: () => 1,
            knockback: 'none',
            removed: true
        },
        {
            label: 'a splash potion of Slowness at a cow',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED, data: SLOWNESS },
            // ThrownSplashPotion.onHitAsPotion: a box it touches takes the full `1 - distance / 4` of 1.
            damage: () => 0,
            knockback: 'none',
            removed: true,
            effect: () => ({ id: 'minecraft:slowness', duration: javaPotionTicks('slowness'), amplifier: 0 })
        }
    ],
    'minecraft:lingering_potion': [
        {
            label: 'a lingering water bottle at a blaze',
            probe: { target: 'minecraft:blaze', speed: PROBE_SPEED, data: WATER_BOTTLE },
            damage: () => 1,
            knockback: 'none',
            removed: true
        },
        {
            label: 'a lingering potion of Slowness at a cow',
            probe: { target: 'minecraft:cow', speed: PROBE_SPEED, data: SLOWNESS },
            // ThrownLingeringPotion.onHitAsPotion leaves a cloud that waits 10 ticks before it reaches anyone.
            damage: () => 0,
            knockback: 'none',
            removed: true,
            cloud: () => ({
                radius: pushedBeside(
                    'minecraft:lingering_potion',
                    'onHitAsPotion',
                    'AreaEffectCloud.setRadius',
                    'before'
                ),
                duration: pushedBeside(
                    'minecraft:lingering_potion',
                    'onHitAsPotion',
                    'AreaEffectCloud.setDuration',
                    'before'
                )
            })
        }
    ]
};

/** Whether two numbers agree to the probe's precision. */
const near = (left: number, right: number, slack = 1e-3): boolean => Math.abs(left - right) <= slack;

/** The differences between what the server did with one throw and what Java does. */
const compareHit = (bedrock: string, java: JavaHitProbe): readonly string[] => {
    const hit = probeProjectileHit(bedrock, java.probe);
    if (typeof hit === 'string') return [hit];
    const differences: string[] = [];
    const damage = java.damage();
    if (!near(hit.damage, damage))
        differences.push(`it takes ${hit.damage} off the ${java.probe.target}, where Java takes ${damage}`);
    // Java's LivingEntity.knockback(0.4) pushes a body at rest 0.4 along the flight and lifts it 0.4.
    const pushed = hit.knockback.horizontal > 1e-3 || hit.knockback.vertical > 1e-3;
    if (java.knockback === 'none' && pushed)
        differences.push(
            `it pushes the ${java.probe.target} ${hit.knockback.horizontal.toFixed(3)} and lifts it ${hit.knockback.vertical.toFixed(3)}, where Java's does not push`
        );
    if (java.knockback === 'blow' && (!near(hit.knockback.horizontal, 0.4) || !near(hit.knockback.vertical, 0.4)))
        differences.push(
            `it pushes the ${java.probe.target} ${hit.knockback.horizontal.toFixed(3)} and lifts it ${hit.knockback.vertical.toFixed(3)}, where Java pushes and lifts it 0.4`
        );
    if (
        java.knockback === 'blow and blast' &&
        (hit.knockback.horizontal < 0.4 - 1e-3 || hit.knockback.vertical < 0.4 - 1e-3)
    )
        differences.push(
            `it pushes the ${java.probe.target} ${hit.knockback.horizontal.toFixed(3)} and lifts it ${hit.knockback.vertical.toFixed(3)}, where Java's blow alone pushes and lifts it 0.4`
        );
    const effect = java.effect?.();
    if (effect !== undefined) {
        const got = hit.effects.get(effect.id);
        if (got === undefined || Math.abs(got.duration - effect.duration) > 2 || got.amplifier !== effect.amplifier)
            differences.push(
                `it gives ${got === undefined ? `no ${effect.id}` : `${effect.id} ${got.amplifier} for ${got.duration} ticks`}, where Java gives ${effect.id} ${effect.amplifier} for ${effect.duration}`
            );
    } else if (hit.effects.size > 0)
        differences.push(`it gives ${[...hit.effects.keys()].join(', ')}, where Java gives none`);
    const fire = java.fire?.() ?? 0;
    if (Math.abs(hit.fireTicks - fire) > 2)
        differences.push(`it sets fire for ${hit.fireTicks} ticks, where Java sets ${fire}`);
    if (hit.removed !== java.removed)
        differences.push(
            `it is ${hit.removed ? 'gone' : 'still there'} after the hit, where Java's is ${java.removed ? 'gone' : 'still there'}`
        );
    const cloud = java.cloud?.();
    const clouds = hit.clouds.map((entry) => `radius ${String(entry.radius)} for ${String(entry.duration)} ticks`);
    if (cloud === undefined && clouds.length > 0)
        differences.push(`it leaves a cloud of ${clouds.join(', ')}, where Java leaves none`);
    if (
        cloud !== undefined &&
        (clouds.length !== 1 || hit.clouds[0]?.radius !== cloud.radius || hit.clouds[0]?.duration !== cloud.duration)
    )
        differences.push(
            `it leaves ${clouds.length === 0 ? 'no cloud' : `a cloud of ${clouds.join(', ')}`}, where Java leaves one of radius ${cloud.radius} for ${cloud.duration} ticks`
        );
    const experience = java.experience?.() ?? 0;
    if (hit.experience !== experience)
        differences.push(`it drops ${hit.experience} experience, where Java drops ${experience}`);
    const owed = java.teleportsOwner?.();
    if (owed !== undefined) {
        const { owner } = hit;
        // The thrower stands eight blocks back; Java takes it to where the pearl was.
        if (owner === undefined || owner.travelled < 4 || !near(owner.lost, owed))
            differences.push(
                `its thrower ${owner === undefined ? 'is gone' : `travels ${owner.travelled.toFixed(1)} blocks and loses ${owner.lost}`}, where Java takes the thrower to it and hurts it ${owed}`
            );
    }
    return differences.map((difference) => `${java.label}: ${difference}`);
};

/** What Java's projectile does when it flies into a block, by Java type, from its class's `onHitBlock` and `onHit`. */
const JAVA_BLOCK_HITS: Readonly<Record<string, { readonly outcome: string; readonly where: string }>> = {
    'minecraft:arrow': { outcome: 'sticks', where: 'AbstractArrow.onHitBlock (inGround)' },
    'minecraft:trident': { outcome: 'sticks', where: 'AbstractArrow.onHitBlock (inGround)' },
    'minecraft:fishing_bobber': { outcome: 'sticks', where: 'FishingHook.onHitBlock (stops where it lands)' },
    'minecraft:fireball': { outcome: 'explodes', where: 'LargeFireball.onHit (explode, discard)' },
    'minecraft:wither_skull': { outcome: 'explodes', where: 'WitherSkull.onHit (explode, discard)' },
    'minecraft:wind_charge': { outcome: 'explodes', where: 'AbstractWindCharge.onHitBlock (explode, discard)' },
    'minecraft:breeze_wind_charge': { outcome: 'explodes', where: 'AbstractWindCharge.onHitBlock (explode, discard)' },
    'minecraft:shulker_bullet': { outcome: 'breaks', where: 'ShulkerBullet.onHit (destroy)' },
    'minecraft:small_fireball': { outcome: 'breaks', where: 'SmallFireball.onHit (discard)' },
    'minecraft:dragon_fireball': { outcome: 'breaks', where: 'DragonFireball.onHit (discard)' },
    'minecraft:llama_spit': { outcome: 'breaks', where: 'LlamaSpit.onHitBlock (discard)' },
    'minecraft:snowball': { outcome: 'breaks', where: 'Snowball.onHit (discard)' },
    'minecraft:egg': { outcome: 'breaks', where: 'ThrownEgg.onHit (discard)' },
    'minecraft:ender_pearl': { outcome: 'breaks', where: 'ThrownEnderpearl.onHit (discard)' },
    'minecraft:experience_bottle': { outcome: 'breaks', where: 'ThrownExperienceBottle.onHit (discard)' },
    'minecraft:splash_potion': { outcome: 'breaks', where: 'AbstractThrownPotion.onHit (discard)' },
    'minecraft:lingering_potion': { outcome: 'breaks', where: 'AbstractThrownPotion.onHit (discard)' }
};

/** The chickens Java's egg hatches when every draw returns one value: `nextInt(8) == 0`, then four for `nextInt(32) == 0`. */
const javaEggChickens = (draw: number): number =>
    Math.floor(draw * 8) !== 0 ? 0 : Math.floor(draw * 32) === 0 ? 4 : 1;

/** The draws the egg probe makes, on either side of Java's one in eight and one in thirty-two. */
const EGG_DRAWS: readonly number[] = [0.03, 0.032, 0.124, 0.126, 0.5];

/** The scenarios for what a projectile does when it hits. */
export const projectileHitScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'projectile-hits-entity',
        java: "A projectile that hits a mob deals Java's blow, push, effect and fire for its class, leaves its cloud or experience, takes its thrower along, and is discarded or stays as Java's is.",
        reference:
            'Java AbstractArrow.onHitEntity (ceil(speed * baseDamage 2)), ThrownTrident.onHitEntity (8), Snowball.onHitEntity (3 for a blaze), ThrownEgg and ThrownEnderpearl.onHitEntity (0) and ThrownEnderpearl.onHit (teleport, enderPearl 5), LargeFireball (6) and SmallFireball.onHitEntity (5, igniteForSeconds 5), LlamaSpit (1 from a llama), ShulkerBullet (4, Levitation 200), WitherSkull (witherSkull 8 or magic 5, Wither II 10 s on normal), AbstractWindCharge (1), DragonFireball.onHit (cloud radius 3, 600 ticks), ThrownExperienceBottle.onHit (3 + nextInt(5) + nextInt(5)), FishingHook.onHitEntity (hooks, no blow), AbstractThrownPotion.onHitAsWater (indirect magic 1 to a water-sensitive mob), and LivingEntity.hurtServer and knockback (0.4 along the flight, lift capped at 0.4), read from the pinned jar; issue #3184, #3183',
        subjects: () => entitiesDeclaring('minecraft:projectile'),
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            subject.javaId === 'minecraft:egg'
                ? ['minecraft:projectile', 'minecraft:apply_knockback_rules']
                : ['minecraft:projectile'],
        run: (subject) => {
            const probes = JAVA_PROJECTILE_HITS[subject.javaId];
            if (probes === undefined) return `no Java hit is recorded for ${subject.javaId}`;
            for (const probe of probes)
                if (probe.knockback !== 'none' && !javaHurtsOnHit(subject.javaId))
                    return `Java's ${subject.javaId} no longer hurts what it hits`;
            const differences = probes.flatMap((probe) => compareHit(subject.bedrock, probe));
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'projectile-hits-block',
        java: "A projectile that flies into a wall sticks, breaks or explodes as Java's class does.",
        reference: `Java ${Object.entries(JAVA_BLOCK_HITS)
            .map(([javaId, hit]) => `${javaId}: ${hit.where}`)
            .join('; ')}`,
        subjects: () => entitiesDeclaring('minecraft:projectile'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:projectile'],
        run: (subject) => {
            const java = JAVA_BLOCK_HITS[subject.javaId];
            if (java === undefined) return `no Java block hit is recorded for ${subject.javaId}`;
            const server = probeProjectileBlockHit(subject.bedrock, PROBE_SPEED);
            return server === java.outcome
                ? undefined
                : `flying into a wall it ${server}, where Java's ${java.outcome}`;
        }
    },
    {
        name: 'egg-hatches-chickens',
        java: 'A thrown egg hatches a chick one time in eight, and four chicks one time in thirty-two of those.',
        reference:
            'Java ThrownEgg.onHit (random.nextInt(8) == 0, then random.nextInt(32) == 0 for 4), read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:projectile').filter((subject) => subject.javaId === 'minecraft:egg'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:projectile'],
        run: (subject) => {
            const bounds = pushedNumbersOf('minecraft:egg', 'onHit');
            if (!bounds.includes(8) || !bounds.includes(32)) return "Java's ThrownEgg.onHit no longer rolls 8 and 32";
            const differences = EGG_DRAWS.flatMap((draw) => {
                const blockHit = probeProjectileHit(subject.bedrock, {
                    target: 'minecraft:cow',
                    speed: PROBE_SPEED,
                    draw
                });
                if (typeof blockHit === 'string') return [blockHit];
                const chickens = blockHit.spawned.filter((identifier) => identifier === 'minecraft:chicken').length;
                const java = javaEggChickens(draw);
                return chickens === java
                    ? []
                    : [`with every draw ${draw} it hatches ${chickens}, where Java hatches ${java}`];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
