import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AIR_STATE } from '@jsprismarine/entities';
import type { ResolvedComponentGroup } from '@jsprismarine/entities/entityType';
import { acceptsStatusEffect } from '@jsprismarine/prismarine/entity/data/EntityRuntime';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { loadJavaEntityAttributes } from '../goldens.ts';
import { isRecord } from '../isRecord.ts';
import { unpackVanillaDatapack } from '../javaDatapack.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import { serverContent } from '../serverStack.ts';
import {
    javaEffectImmunities,
    javaEffectsNamedByCanBeAffected,
    javaEntityClassName,
    javaFireImmune,
    javaEntityTypeBuilders,
    javaMethodOf,
    numberBeforeWrite,
    numberNear,
    pushedNumbers
} from './javaEntityCode.ts';
import type { SandboxHit, SandboxMedium } from './sandbox.ts';
import { SANDBOX_ORIGIN, inSandbox } from './sandbox.ts';
import type { EntitySubject } from './subjects.ts';
import { componentValues, entitiesDeclaring, field, mappedEntity } from './subjects.ts';
import { playerRuleScenarios } from './playerRules.ts';
import { projectileHitScenarios } from './projectileHits.ts';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/**
 * Damage, environment and senses: what hurts an entity, what it is immune to, and what it notices.
 * Every scenario runs the server's real entity runtime in the shared stack's sandbox and reads the
 * Java side from the pinned jar's entity classes or the datapack's tags.
 */

const LIVING = 'net/minecraft/world/entity/LivingEntity';
const ENTITY = 'net/minecraft/world/entity/Entity';

/** One method of a pinned Java class, which a scenario reads its constants from. */
const javaMethod = (className: string, method: string) => {
    const found = javaMethodOf(className, method);
    if (found === undefined) throw new Error(`${className} declares no ${method}`);
    return found.method;
};

/** A number a Java method pushes beside a call, or a throw naming what was missing. */
const javaNumber = (className: string, method: string, call: string, side: 'before' | 'after'): number => {
    const value = numberNear(javaMethod(className, method), call, side);
    if (value === undefined) throw new Error(`${className}.${method} pushes no number ${side} ${call}`);
    return value;
};

/** Whether a Java entity type is a living entity, which only those the attribute dump lists are. */
const javaLiving = (javaId: string): boolean => loadJavaEntityAttributes()[javaId] !== undefined;

/** Whether the server's definition of an entity declares a component, in its base or a group. */
const declaresComponent = (bedrock: string, component: string): boolean =>
    serverContent().entities.registry.get(bedrock)?.declaredComponents.includes(component) === true;

/** The ticks and amounts of hits, as the difference a scenario names. */
const describeHits = (hits: readonly Pick<SandboxHit, 'tick' | 'amount'>[]): string =>
    hits.length === 0 ? 'nothing' : hits.map((hit) => `${hit.amount} on tick ${hit.tick}`).join(', ');

const sameHits = (
    server: readonly Pick<SandboxHit, 'tick' | 'amount'>[],
    java: readonly Pick<SandboxHit, 'tick' | 'amount'>[]
): boolean =>
    server.length === java.length &&
    server.every(
        (hit, index) => hit.tick === java[index]?.tick && Math.abs(hit.amount - (java[index]?.amount ?? 0)) < 1e-6
    );

/**
 * Java's hits for a hazard that lands `amount` on the first tick and then whenever the half-second
 * hurt cooldown has run out, until `ticks` have passed or the health is gone.
 *
 * `LivingEntity.hurtServer` turns a blow aside while `invulnerableTime` is above 10 and sets it to
 * 20 after one lands, and `baseTick` takes one off a tick, so a hazard that tries every tick lands
 * every tenth.
 */
const cooldownHits = (amount: number, ticks: number, health: number): Pick<SandboxHit, 'tick' | 'amount'>[] => {
    const hits: Pick<SandboxHit, 'tick' | 'amount'>[] = [];
    let left = health;
    for (let tick = 1; tick <= ticks && left > 0; tick += 10) {
        hits.push({ tick, amount });
        left -= amount;
    }
    return hits;
};

/** How many ticks the hazard scenarios watch an entity for: three of the half-second cooldowns. */
const HAZARD_TICKS = 25;

/** Every living Java entity type that either edition makes immune to fire, or whose server type hurts in lava. */
const lavaSubjects = (): readonly EntitySubject[] => {
    const subjects = new Map<string, EntitySubject>();
    for (const subject of [
        ...entitiesDeclaring('minecraft:hurt_on_condition'),
        ...entitiesDeclaring('minecraft:fire_immune'),
        ...[...javaEntityTypeBuilders().keys()].filter(javaFireImmune).flatMap((javaId) => mappedEntity(javaId) ?? [])
    ])
        if (javaLiving(subject.javaId)) subjects.set(subject.javaId, subject);
    return [...subjects.values()];
};

/** The aspects a lava row compares: the hurt condition that deals it and the immunity that stops it. */
const lavaAspects = (subject: EntitySubject): readonly string[] => [
    ...(declaresComponent(subject.bedrock, 'minecraft:hurt_on_condition') ? ['minecraft:hurt_on_condition'] : []),
    ...(declaresComponent(subject.bedrock, 'minecraft:fire_immune') || javaFireImmune(subject.javaId)
        ? ['minecraft:fire_immune']
        : [])
];

/** Java's living entities that `isSensitiveToWater`, which `LivingEntity.aiStep` drowns in water or rain. */
const javaSensitiveToWater = (javaId: string): boolean => {
    const method = javaMethodOf(javaEntityClassName(javaId), 'isSensitiveToWater');
    return method !== undefined && pushedNumbers(method.method).at(-1) === 1;
};

/** What a Java entity's air does: how much it holds and which code spends it. */
interface JavaAir {
    /** `getMaxAirSupply`, in ticks. */
    readonly max: number;
    /** The class whose `handleAirSupply` runs, when the entity's class overrides the living default. */
    readonly handler: string | undefined;
    /** Whether `canBreatheUnderwater` holds for a freshly spawned adult; undefined when it depends on more than the type. */
    readonly breathesUnderwater: boolean | undefined;
}

/** The classes whose `handleAirSupply` drowns or dries out an entity out of water. */
const STRANDED_HANDLERS: ReadonlySet<string> = new Set(['WaterAnimal', 'AgeableWaterCreature', 'Axolotl', 'Nautilus']);

const javaAir = (javaId: string): JavaAir => {
    const className = javaEntityClassName(javaId);
    const max = pushedNumbers(javaMethod(className, 'getMaxAirSupply')).at(0) ?? 0;
    const handler = javaMethodOf(className, 'handleAirSupply');
    const breathes = javaMethodOf(className, 'canBreatheUnderwater');
    return {
        max,
        handler: handler === undefined || handler.method.instructions.length === 0 ? undefined : handler.owner,
        breathesUnderwater:
            breathes?.owner === 'LivingEntity'
                ? serverContent().tags.members('entity_type', 'minecraft:can_breathe_under_water').includes(javaId)
                : undefined
    };
};

/** Whether any value of a component in a server definition mentions a word, such as a sensor naming lightning. */
const componentValuesMention = (bedrock: string, component: string, word: string): boolean =>
    componentValues(bedrock, component).some((value) => JSON.stringify(value).includes(word));

/** The first component group of a resolved type that declares a component. */
const groupDeclaring = (groups: ReadonlyMap<string, ResolvedComponentGroup>, component: string): string | undefined =>
    [...groups.values()].find((group) => group.components.some((bound) => bound.name === component))?.name;

/** Whether a Java entity type is in an entity type tag of the pinned datapack. */
const javaInTag = (javaId: string, tag: string): boolean =>
    serverContent().tags.members('entity_type', tag).includes(javaId);

/** Every living Java entity type the server runs, which is the universe of the immunity rows. */
const livingSubjects = (): readonly EntitySubject[] =>
    Object.keys(loadJavaEntityAttributes())
        .sort()
        .flatMap((javaId) => (javaId === 'minecraft:player' ? [] : (mappedEntity(javaId) ?? [])));

/** Whether Java lets only a player or an explosion hurt the type, as `EnderDragon.hurtServer` does the dragon. */
const javaHurtOnlyByPlayers = (javaId: string): boolean => javaId === 'minecraft:ender_dragon';

/** How far the fall the damage sensor rows compare drops, in blocks. */
const FALL_BLOCKS = 20;

/** How long a fall row watches a dropped entity: long enough for {@link FALL_BLOCKS} under Java's gravity. */
const FALL_TICKS = 50;

/** Java's `Entity.getTicksRequiredToFreeze`, which the freezing rows start an entity at. */
const FROZEN_THROUGH = 140;

/** How often `LivingEntity.aiStep` hurts a fully frozen entity. */
const FREEZE_CYCLE = 40;

/**
 * Java's fall damage for a type from {@link FALL_BLOCKS}: none for the `fall_damage_immune` tag,
 * else `LivingEntity.calculateFallDamage`, the fall past the `safe_fall_distance` attribute times
 * `fall_damage_multiplier`, floored, less what an override such as `Goat.calculateFallDamage`
 * takes off.
 */
const javaFallDamage = (javaId: string): number => {
    if (javaInTag(javaId, 'minecraft:fall_damage_immune')) return 0;
    if (javaHurtOnlyByPlayers(javaId)) return 0;
    const attributes = loadJavaEntityAttributes()[javaId]?.attributes ?? {};
    const safe = attributes['minecraft:safe_fall_distance'] ?? 3;
    const multiplier = attributes['minecraft:fall_damage_multiplier'] ?? 1;
    const base = Math.floor((FALL_BLOCKS + 1e-6 - safe) * multiplier);
    const override = javaMethodOf(javaEntityClassName(javaId), 'calculateFallDamage');
    const less =
        override === undefined || override.owner === 'LivingEntity'
            ? 0
            : (numberNear(override.method, '.calculateFallDamage', 'after') ?? 0);
    return Math.max(0, base - less);
};

/** One blow straight through the server's damage pipeline at a sandboxed entity, with what it took. */
const pipelineBlow = (bedrock: string, cause: string, amount: number): number | string => {
    const taken = inSandbox(bedrock, 'air', ({ stack, entity }) => {
        const outcome = stack.runtime.damage({
            target: entity.id,
            cause,
            amount,
            source: { route: 'component', feedback: false, remembered: false }
        });
        return outcome.committed ? outcome.taken : 0;
    });
    return taken;
};

/** The scenarios that compare what an entity is immune to. */
const immunityScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'effect-immunity',
        java: "A living entity refuses exactly the status effects Java's canBeAffected refuses its type: the poison of a spider, the wither of a wither skeleton, the poison and regeneration of the undead, and the rest.",
        reference:
            'Java LivingEntity.canBeAffected (entity type tags immune_to_infested, immune_to_oozing, ignores_poison_and_regen) and its overrides in Spider, WitherBoss, WitherSkeleton, Parched and AbstractNautilus, read from the pinned jar',
        subjects: () =>
            livingSubjects().filter(
                (subject) =>
                    declaresComponent(subject.bedrock, 'minecraft:mob_effect_immunity') ||
                    javaEffectImmunities(subject.javaId, (tag) => javaInTag(subject.javaId, tag)).size > 0
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:mob_effect_immunity'],
        run: (subject) => {
            const java = javaEffectImmunities(subject.javaId, (tag) => javaInTag(subject.javaId, tag));
            const probes = javaEffectsNamedByCanBeAffected(livingSubjects().map((entry) => entry.javaId));
            const refused = inSandbox(subject.bedrock, 'air', ({ entity }) =>
                probes.filter((effect) => !acceptsStatusEffect(entity.instance, effect))
            );
            if (typeof refused === 'string') return refused;
            const server = new Set(refused);
            const missing = [...java].filter((effect) => !server.has(effect));
            const extra = [...server].filter((effect) => !java.has(effect));
            if (missing.length === 0 && extra.length === 0) return undefined;
            return `the server refuses it ${[...server].sort().join(', ') || 'nothing'}, where Java refuses ${[...java].sort().join(', ') || 'nothing'}`;
        }
    },
    {
        name: 'freeze-immunity',
        java: "A fully frozen living entity in powder snow takes Java's freezing blow every 40 ticks: nothing for a type in freeze_immune_entity_types or a skeleton, which Skeleton.canFreeze refuses, 5 for a type in freeze_hurts_extra_types, and 1 for the rest.",
        reference:
            'Java LivingEntity.aiStep (ticksFrozen, isFullyFrozen, tickCount % 40, freeze 1 or 5 for the entity type tag freeze_hurts_extra_types), Entity.canFreeze (entity type tag freeze_immune_entity_types) and Skeleton.canFreeze, read from the pinned jar; issue #3150',
        subjects: livingSubjects,
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            ['minecraft:freezing_immune', 'minecraft:freezing_vulnerable'].filter((component) =>
                declaresComponent(subject.bedrock, component)
            ),
        run: (subject) => {
            const freezes = javaMethodOf(javaEntityClassName(subject.javaId), 'canFreeze');
            const immune =
                javaHurtOnlyByPlayers(subject.javaId) ||
                javaInTag(subject.javaId, 'minecraft:freeze_immune_entity_types') ||
                (freezes !== undefined &&
                    freezes.method.calls.length === 0 &&
                    pushedNumbers(freezes.method).join() === '0');
            const java = immune ? 0 : javaInTag(subject.javaId, 'minecraft:freeze_hurts_extra_types') ? 5 : 1;
            const hits = inSandbox(subject.bedrock, 'minecraft:powder_snow', (sandbox) => {
                // Frozen through at once, so one 40-tick cycle holds exactly one blow.
                sandbox.stack.runtime.setFrozenTicks(sandbox.entity.id, FROZEN_THROUGH);
                return sandbox.tick(FREEZE_CYCLE).filter((hit) => hit.cause === 'freezing' && hit.taken > 0);
            });
            if (typeof hits === 'string') return hits;
            const server = hits[0]?.taken ?? 0;
            return server === java && (java === 0 || hits.length === 1)
                ? undefined
                : `frozen through in powder snow it is hurt ${describeHits(hits)} in ${FREEZE_CYCLE} ticks, where Java hurts it ${java === 0 ? 'nothing' : `${java} once`}`;
        }
    },
    {
        name: 'fall-damage-sensor',
        java: "A living entity dropped from 20 blocks takes Java's calculateFallDamage on landing: nothing for a type in fall_damage_immune, the fall past its safe fall distance times its multiplier, less what a goat or a frog takes off.",
        reference:
            'Java Entity.checkFallDamage, LivingEntity.calculateFallDamage (entity type tag fall_damage_immune, safe_fall_distance and fall_damage_multiplier attributes) and its overrides in Goat and Frog, read from the pinned jar; issue #3147',
        subjects: () => entitiesDeclaring('minecraft:damage_sensor').filter((subject) => javaLiving(subject.javaId)),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:damage_sensor'],
        run: (subject) => {
            const java = javaFallDamage(subject.javaId);
            const falls = inSandbox(
                subject.bedrock,
                'air',
                (sandbox) => sandbox.tick(FALL_TICKS).filter((hit) => hit.cause === 'fall'),
                { lift: FALL_BLOCKS }
            );
            if (typeof falls === 'string') return falls;
            const taken = falls.reduce((sum, hit) => sum + hit.taken, 0);
            return Math.abs(taken - java) < 1e-6 && falls.length <= 1
                ? undefined
                : `dropped ${FALL_BLOCKS} blocks it takes ${describeHits(falls)}, where Java's fall takes ${java}`;
        }
    }
];

/**
 * The projectile each Java shooter fires, with where Java creates it. Java builds these in code,
 * mostly through method references the class file keeps only as bootstrap arguments, so the
 * table cites the method rather than reading it.
 */
const JAVA_SHOOTER_PROJECTILES: Readonly<Record<string, readonly [string, string]>> = {
    'minecraft:blaze': ['minecraft:small_fireball', 'Blaze$BlazeAttackGoal.tick'],
    'minecraft:bogged': ['minecraft:arrow', 'AbstractSkeleton.performRangedAttack (Bogged.getArrow tips it)'],
    'minecraft:drowned': ['minecraft:trident', 'Drowned.performRangedAttack'],
    'minecraft:ender_dragon': ['minecraft:dragon_fireball', 'DragonStrafePlayerPhase.doServerTick'],
    'minecraft:ghast': ['minecraft:fireball', 'Ghast$GhastShootFireballGoal.tick (LargeFireball)'],
    'minecraft:llama': ['minecraft:llama_spit', 'Llama.spit'],
    'minecraft:parched': ['minecraft:arrow', 'AbstractSkeleton.performRangedAttack'],
    'minecraft:piglin': ['minecraft:arrow', 'Piglin.performRangedAttack (CrossbowAttackMob.performCrossbowAttack)'],
    'minecraft:pillager': ['minecraft:arrow', 'Pillager.performRangedAttack (CrossbowAttackMob.performCrossbowAttack)'],
    'minecraft:shulker': ['minecraft:shulker_bullet', 'Shulker$ShulkerAttackGoal.tick'],
    'minecraft:skeleton': ['minecraft:arrow', 'AbstractSkeleton.performRangedAttack'],
    'minecraft:snow_golem': ['minecraft:snowball', 'SnowGolem.performRangedAttack'],
    'minecraft:stray': ['minecraft:arrow', 'AbstractSkeleton.performRangedAttack (Stray.getArrow tips it)'],
    'minecraft:trader_llama': ['minecraft:llama_spit', 'Llama.spit'],
    'minecraft:witch': ['minecraft:splash_potion', 'Witch.performRangedAttack'],
    'minecraft:wither': ['minecraft:wither_skull', 'WitherBoss.performRangedAttack (WitherSkull)'],
    'minecraft:wither_skeleton': [
        'minecraft:arrow',
        'AbstractSkeleton.performRangedAttack (WitherSkeleton.getArrow sets it alight)'
    ]
};

/** What Java's `thunderHit` does to a type a lightning bolt strikes, by the class that overrides it. */
const javaThunderHit = (javaId: string): string => {
    const hit = javaMethodOf(javaEntityClassName(javaId), 'thunderHit');
    const calls = hit?.method.calls ?? [];
    const converts = (hit === undefined ? [] : javaOperations(hit.method)).find(
        (instruction) => instruction.kind === 'field' && instruction.target.startsWith('EntityTypes.')
    );
    if (converts?.kind === 'field')
        return `it becomes ${`minecraft:${converts.target.slice('EntityTypes.'.length).toLowerCase()}`}`;
    if (hit?.owner === 'Turtle') return 'it dies';
    if (hit?.owner === 'MushroomCow') return 'it changes variant';
    const lightning = javaNumber(ENTITY, 'thunderHit', 'DamageSources.lightningBolt', 'after');
    if (hit?.owner === 'Creeper') return `it takes ${lightning} and becomes powered`;
    // CopperGolem.thunderHit steps the weather state back only when the golem has weathered, which
    // a freshly spawned one has not, so it takes the bolt's damage alone.
    return calls.length === 0 ? 'nothing' : `it takes ${lightning}`;
};

/** The scenarios for what an entity shoots and how its projectiles fly. */
const projectileScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'shoots-projectile',
        java: 'A ranged mob fires the projectile Java creates for it.',
        reference:
            'Java, per shooter: ' +
            Object.entries(JAVA_SHOOTER_PROJECTILES)
                .map(([shooter, [, where]]) => `${shooter} ${where}`)
                .join('; '),
        subjects: () => entitiesDeclaring('minecraft:shooter'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:shooter'],
        run: (subject) => {
            const java = JAVA_SHOOTER_PROJECTILES[subject.javaId]?.[0];
            if (java === undefined) return `no Java shooter is recorded for ${subject.javaId}`;
            const javaBedrock = javaEntityTypeToBedrock(java);
            const shot = inSandbox(subject.bedrock, 'air', ({ stack, entity }) => {
                // A shooter some vanilla files keep in a group, such as the drowned's trident
                // mode, is put on the way the group's event would.
                if (!entity.instance.hasComponent('minecraft:shooter')) {
                    const group = groupDeclaring(entity.instance.type.groups, 'minecraft:shooter');
                    if (group !== undefined)
                        entity.instance.restoreComponentGroups([...entity.instance.activeComponentGroups(), group]);
                }
                const target = stack.runtime.spawn('minecraft:cow', { ...SANDBOX_ORIGIN, x: SANDBOX_ORIGIN.x + 6 });
                const body = stack.runtime.bodyOf(entity.instance);
                const mob = target === undefined ? undefined : stack.runtime.mobById(target.id);
                if (body === undefined || mob === undefined) return 'the sandbox could not put a target in front of it';
                const before = new Set(stack.runtime.near(SANDBOX_ORIGIN, 12).map((other) => other.id));
                stack.runtime.shoot(body, mob, undefined);
                return stack.runtime
                    .near(SANDBOX_ORIGIN, 12)
                    .filter((other) => !before.has(other.id))
                    .map((other) => other.identifier);
            });
            if (typeof shot === 'string') return shot;
            const expected = javaBedrock.kind === 'mapped' ? javaBedrock.bedrock : java;
            return shot.length === 1 && shot[0] === expected
                ? undefined
                : `it fires ${shot.join(', ') || 'nothing'}, where Java fires ${java}`;
        }
    }
];

/** The scenarios for what a lightning bolt and magic do to an entity. */
const strikeScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'struck-by-lightning',
        java: "A lightning bolt beside a living entity runs Java's thunderHit: 5 lightning damage, or the conversion, variant change or death the type's override makes of it.",
        reference:
            'Java LightningBolt.tick (hits entities within 3 blocks), Entity.thunderHit (lightningBolt 5) and its overrides in Pig, Villager, Creeper, MushroomCow, Turtle and CopperGolem, read from the pinned jar; issue #3148',
        subjects: () =>
            entitiesDeclaring('minecraft:damage_sensor').filter(
                (subject) =>
                    javaLiving(subject.javaId) &&
                    componentValuesMention(subject.bedrock, 'minecraft:damage_sensor', 'lightning')
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:damage_sensor'],
        run: (subject) => {
            const java = javaThunderHit(subject.javaId);
            // The groups the entity ends with after the same ticks without a bolt, such as an
            // axolotl's on-land group, which are not the bolt's doing.
            const unstruck = inSandbox(subject.bedrock, 'air', (sandbox) => {
                sandbox.tick(20);
                return new Set(sandbox.entity.instance.activeComponentGroups());
            });
            const server = inSandbox(subject.bedrock, 'air', (sandbox) => {
                const groups = new Set(sandbox.entity.instance.activeComponentGroups());
                sandbox.stack.runtime.spawn('minecraft:lightning_bolt', SANDBOX_ORIGIN);
                const hits = sandbox.tick(20).filter((hit) => hit.cause === 'lightning');
                const replaced = sandbox.stack.runtime
                    .near(SANDBOX_ORIGIN, 3)
                    .filter(
                        (other) => other.id !== sandbox.entity.id && other.identifier !== 'minecraft:lightning_bolt'
                    );
                if (sandbox.entity.removed !== undefined && replaced.length > 0)
                    return `it becomes ${replaced[0]?.identifier ?? ''}`;
                if (hits.some((hit) => hit.died)) return 'it dies';
                const baseline = typeof unstruck === 'string' ? groups : unstruck;
                const now = sandbox.entity.instance.activeComponentGroups();
                const added = now.filter((group) => !groups.has(group) && !baseline.has(group));
                const changed =
                    added.length > 0 || now.some((group) => !baseline.has(group)) || now.length !== baseline.size;
                // A creeper's lightning event adds its charged group, which is Java's powered flag.
                const effect = added.some((group) => group.includes('charged'))
                    ? 'becomes powered'
                    : changed
                      ? 'changes variant'
                      : undefined;
                const taken = hits.reduce((sum, hit) => sum + hit.taken, 0);
                if (taken > 0) return `it takes ${taken}${effect === undefined ? '' : ` and ${effect}`}`;
                return effect === undefined ? 'nothing' : `it ${effect}`;
            });
            if (typeof server === 'string' && server === java) return undefined;
            const bedrockJava = java.startsWith('it becomes ')
                ? javaEntityTypeToBedrock(java.slice('it becomes '.length))
                : undefined;
            if (bedrockJava?.kind === 'mapped' && server === `it becomes ${bedrockJava.bedrock}`) return undefined;
            return `when lightning strikes beside it, ${server}, where in Java ${java}`;
        }
    },
    {
        name: 'witch-magic-resistance',
        java: "A witch takes 15 percent of a magic blow, which Java's witch_resistant_to damage type tag names.",
        reference:
            'Java Witch.getDamageAfterMagicAbsorb (0.15 for DamageTypeTags.WITCH_RESISTANT_TO), read from the pinned jar',
        subjects: () => ['minecraft:witch'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:damage_sensor'],
        run: (subject) => {
            const share = javaNumber(
                javaEntityClassName(subject.javaId),
                'getDamageAfterMagicAbsorb',
                'DamageSource.is',
                'after'
            );
            const taken = pipelineBlow(subject.bedrock, 'magic', 10);
            if (typeof taken === 'string') return taken;
            return Math.abs(taken - 10 * share) < 1e-3
                ? undefined
                : `a magic blow of 10 takes ${taken} health off it, where Java's takes ${(10 * share).toFixed(2)}`;
        }
    }
];

/** The first number any overload of a Java method pushes before it writes a field. */
const javaFieldInitializer = (
    javaId: string,
    method: string,
    field: string,
    occurrence: 'first' | 'last' = 'first'
): number => {
    const className = javaEntityClassName(javaId);
    for (const candidate of pinnedJavaClass(className).filter((entry) => entry.name === method)) {
        const value = numberBeforeWrite(candidate, field, occurrence);
        if (value !== undefined) return value;
    }
    throw new Error(`${className}.${method} writes no number to ${field}`);
};

/** A number a Java entity class's method pushes beside a call, for the explosion table. */
const javaEntityNumber = (javaId: string, method: string, call: string, side: 'before' | 'after'): number => {
    const className = javaEntityClassName(javaId);
    for (const candidate of pinnedJavaClass(className).filter((entry) => entry.name === method)) {
        const value = numberNear(candidate, call, side);
        if (value !== undefined) return value;
    }
    throw new Error(`${className}.${method} pushes no number ${side} ${call}`);
};

/**
 * A value of the explosive sulfur cube archetype in the pinned datapack, which is the only one
 * that explodes: its `power`, or its `fuse` in ticks.
 */
const javaSulfurCubeExplosion = (key: 'power' | 'fuse'): number => {
    const path = join(unpackVanillaDatapack(), 'data', 'minecraft', 'sulfur_cube_archetype', 'explosive.json');
    // Parsed JSON boundary: the archetype file the datapack ships.
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const explosion = isRecord(parsed) ? parsed.explosion : undefined;
    const value = isRecord(explosion) ? explosion[key] : undefined;
    if (typeof value !== 'number') throw new Error(`the explosive sulfur cube archetype has no ${key}`);
    return value;
};

/** One explosion Java sets off: the server group that carries it, and Java's power and fuse in ticks. */
interface JavaExplosion {
    /** The component group the explosion is in on the server, or undefined when it is a base component. */
    readonly group: string | undefined;
    readonly power: () => number;
    readonly fuse: () => number;
}

/** The explosions of the Java types the server gives `minecraft:explode`, with the code each value is read from. */
const JAVA_EXPLOSIONS: Readonly<Record<string, JavaExplosion>> = {
    // Creeper.<init> sets explosionRadius and maxSwell; explodeCreeper uses the radius.
    'minecraft:creeper': {
        group: 'minecraft:exploding',
        power: () => javaFieldInitializer('minecraft:creeper', '<init>', 'Creeper.explosionRadius'),
        fuse: () => javaFieldInitializer('minecraft:creeper', '<init>', 'Creeper.maxSwell')
    },
    // EndCrystal.hurtServer explodes at once with power 6.
    'minecraft:end_crystal': {
        group: 'crystal_exploding',
        power: () => javaEntityNumber('minecraft:end_crystal', 'hurtServer', '.getZ', 'after'),
        fuse: () => 0
    },
    // LargeFireball.<init> sets explosionPower; onHit explodes on impact.
    'minecraft:fireball': {
        group: 'minecraft:exploding',
        power: () => javaFieldInitializer('minecraft:fireball', '<init>', 'LargeFireball.explosionPower'),
        fuse: () => 0
    },
    // PrimedTnt.<init> sets explosionPower and calls setFuse.
    'minecraft:tnt': {
        group: undefined,
        power: () => javaFieldInitializer('minecraft:tnt', '<init>', 'PrimedTnt.explosionPower'),
        fuse: () => javaEntityNumber('minecraft:tnt', '<init>', '.setFuse', 'before')
    },
    // MinecartTNT.<init> sets explosionPowerBase, which a minecart at rest explodes with; primeFuse sets the fuse.
    'minecraft:tnt_minecart': {
        group: 'minecraft:primed_tnt',
        power: () => javaFieldInitializer('minecraft:tnt_minecart', '<init>', 'MinecartTNT.explosionPowerBase'),
        fuse: () => javaFieldInitializer('minecraft:tnt_minecart', 'primeFuse', 'MinecartTNT.fuse')
    },
    // WindCharge.explode and BreezeWindCharge.explode burst on impact.
    'minecraft:wind_charge': {
        group: undefined,
        power: () => javaEntityNumber('minecraft:wind_charge', 'explode', 'Vec3.z', 'after'),
        fuse: () => 0
    },
    'minecraft:breeze_wind_charge': {
        group: undefined,
        power: () => javaEntityNumber('minecraft:breeze_wind_charge', 'explode', 'Vec3.z', 'after'),
        fuse: () => 0
    },
    // SulfurCube.primeTime lights the fuse of the archetype it swallowed; tickFuse explodes with its power.
    'minecraft:sulfur_cube': {
        group: 'minecraft:sulfur_cube_medium_primed',
        power: () => javaSulfurCubeExplosion('power'),
        fuse: () => javaSulfurCubeExplosion('fuse')
    },
    // WitherSkull.onHit explodes on impact with power 1.
    'minecraft:wither_skull': {
        group: 'minecraft:exploding',
        power: () => javaEntityNumber('minecraft:wither_skull', 'onHit', '.getZ', 'after'),
        fuse: () => 0
    }
};

/** The scenarios for what an entity's explosion does. */
const explosionScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'explosion-power-and-fuse',
        java: "An entity that explodes does so with Java's power after Java's fuse: a creeper 3 after 30 ticks, primed TNT 4 after 80, an end crystal 6 at once.",
        reference:
            'Java Creeper.<init> (explosionRadius, maxSwell), PrimedTnt.<init> (explosionPower, setFuse), EndCrystal.hurtServer, LargeFireball.<init>, MinecartTNT.<init> and primeFuse, WitherSkull.onHit, and SulfurCube.primeTime with the datapack explosive sulfur_cube_archetype, read from the pinned jar; issue #3150',
        subjects: () => entitiesDeclaring('minecraft:explode'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:explode'],
        run: (subject) => {
            const java = JAVA_EXPLOSIONS[subject.javaId];
            if (java === undefined) return `no Java explosion is recorded for ${subject.javaId}`;
            const server = inSandbox(
                subject.bedrock,
                'air',
                ({ stack, entity }) => {
                    if (java.group !== undefined)
                        entity.instance.restoreComponentGroups([
                            ...entity.instance.activeComponentGroups(),
                            java.group
                        ]);
                    const params = entity.instance.componentParams('minecraft:explode');
                    const power = field(params, 'power');
                    stack.world.advance();
                    stack.runtime.tick(stack.world.world.level.gameTime());
                    const exploded = stack.runtime.byId(entity.id) === undefined;
                    return { power, fuse: exploded ? 0 : (entity.body.fuseTicks ?? -1) + 1 };
                },
                { lift: 1 }
            );
            if (typeof server === 'string') return server;
            const differences: string[] = [];
            // Java keeps some powers as floats, such as the wind charge's 1.2.
            if (typeof server.power !== 'number' || Math.abs(server.power - java.power()) > 1e-6)
                differences.push(`it explodes with power ${String(server.power)}, where Java's is ${java.power()}`);
            // A fuse of one tick and none both go off on the first tick.
            if (Math.max(1, server.fuse) !== Math.max(1, java.fuse()))
                differences.push(`its fuse burns ${server.fuse} ticks, where Java's burns ${java.fuse()}`);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];

/** The gaps between hits and their amounts, which a recurring hazard's cadence is. */
const cadenceOf = (hits: readonly Pick<SandboxHit, 'tick' | 'amount'>[]): string =>
    hits
        .slice(1)
        .map((hit, index) => `${hit.amount} after ${hit.tick - (hits[index]?.tick ?? 0)} ticks`)
        .join(', ');

/** Java's recurring hurt for a type whose server definition has `minecraft:damage_over_time`, with the group carrying it. */
const JAVA_DAMAGE_OVER_TIME: Readonly<
    Record<string, { readonly group: string; readonly amount: () => number; readonly interval: () => number }>
> = {
    // Vex.tick: once its limited life runs out, starve 1, and the counter set back to 20.
    'minecraft:vex': {
        group: 'minecraft:periodic_damage',
        amount: () => javaEntityNumber('minecraft:vex', 'tick', 'DamageSources.starve', 'after'),
        interval: () => javaFieldInitializer('minecraft:vex', 'tick', 'Vex.limitedLifeTicks', 'last')
    },
    // Axolotl.handleAirSupply: out of air on land, dryOut 2 each time the air reaches -20.
    'minecraft:axolotl': {
        group: 'axolotl_dried',
        amount: () => javaEntityNumber('minecraft:axolotl', 'handleAirSupply', 'DamageSources.dryOut', 'after'),
        interval: () => -(pushedNumbers(javaMethod(LIVING, 'shouldTakeDrowningDamage'))[0] ?? 0)
    },
    // Dolphin.tick: dried out, dryOut 1 every tick, which the half-second hurt cooldown spaces ten apart.
    'minecraft:dolphin': {
        group: 'dolphin_dried',
        amount: () => javaEntityNumber('minecraft:dolphin', 'tick', 'DamageSources.dryOut', 'after'),
        interval: () => 10
    }
};

/** The scenarios for the hurts an entity's own state deals it over time, and its sunlight. */
const conditionScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'damage-over-time',
        java: "A vex past its life, or a dried-out axolotl or dolphin, is hurt on Java's cadence: a vex 1 every 20 ticks, an axolotl 2 every 20, a dolphin 1 every 10.",
        reference:
            'Java Vex.tick (starve 1, limitedLifeTicks back to 20), Axolotl.handleAirSupply (dryOut 2 at -20 air) and Dolphin.tick (dryOut 1 a tick, under the 10-tick hurt cooldown), read from the pinned jar; issue #3149',
        subjects: () => entitiesDeclaring('minecraft:damage_over_time'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:damage_over_time'],
        run: (subject) => {
            const java = JAVA_DAMAGE_OVER_TIME[subject.javaId];
            if (java === undefined) return `no Java recurring hurt is recorded for ${subject.javaId}`;
            const hits = inSandbox(subject.bedrock, 'air', (sandbox) => {
                sandbox.entity.instance.restoreComponentGroups([
                    ...sandbox.entity.instance.activeComponentGroups(),
                    java.group
                ]);
                return sandbox.tick(65).filter((hit) => hit.taken > 0 && hit.cause !== 'drowning');
            });
            if (typeof hits === 'string') return hits;
            const expected = [0, 1, 2].map((index) => ({ tick: 1 + index * java.interval(), amount: java.amount() }));
            const server = cadenceOf(hits.slice(0, 3));
            return hits.length >= 3 && server === cadenceOf(expected) && hits[0]?.amount === java.amount()
                ? undefined
                : `it is hurt ${hits[0]?.amount ?? 0} then ${server || 'nothing more'}, where Java hurts it ${java.amount()} then ${cadenceOf(expected)}`;
        }
    },
    {
        name: 'sunlight-burns-only-the-tagged',
        java: "A mob outside Java's burn_in_daylight tag never catches fire standing in full sunlight.",
        reference: 'Java entity type tag burn_in_daylight and Mob.isSunBurnTick, which only the tagged types call',
        subjects: () =>
            entitiesDeclaring('minecraft:burns_in_daylight').filter(
                (subject) => !javaInTag(subject.javaId, 'minecraft:burn_in_daylight')
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:burns_in_daylight'],
        run: (subject) => {
            const burned = inSandbox(subject.bedrock, 'air', (sandbox) => {
                let burning = false;
                sandbox.tick(25, () => {
                    burning ||= sandbox.entity.body.fireTicks > 0;
                });
                return burning;
            });
            if (typeof burned === 'string') return burned;
            return burned ? 'the server sets it alight in sunlight, which Java never does' : undefined;
        }
    }
];

/**
 * How many ticks a dead entity of a Java type stays in the world: `LivingEntity.tickDeath`'s
 * limit on `deathTime`, read from the jar, or 0 for a type whose `kill` removes it at once, as
 * `ArmorStand.kill` does.
 */
const javaDeathTicks = (javaId: string): number => {
    const className = javaEntityClassName(javaId);
    if (javaMethodOf(className, 'kill')?.owner === 'ArmorStand') return 0;
    const limit = pushedNumbers(javaMethod('net/minecraft/world/entity/LivingEntity', 'tickDeath')).find(
        (value) => value > 1
    );
    if (limit === undefined) throw new Error('LivingEntity.tickDeath pushes no death limit');
    return limit;
};

/**
 * How many ticks a server entity stays after a blow kills it, or a reason it cannot be measured.
 * The ender dragon's death is its own sequence, which the `dragon-death` rows compare.
 */
const deathTicksOnServer = (bedrock: string, limit: number): number | string =>
    inSandbox(bedrock, 'air', ({ stack, entity, tick }) => {
        const outcome = stack.runtime.damage({
            target: entity.id,
            cause: 'void',
            amount: 100_000,
            source: { route: 'component', feedback: false, remembered: false }
        });
        if (!outcome.committed || !outcome.died) return 'a lethal void blow does not kill it';
        if (entity.removed !== undefined) return 0;
        let stayed: number | undefined;
        tick(limit + 5, (ticked) => {
            if (stayed === undefined && entity.removed !== undefined) stayed = ticked;
        });
        return stayed ?? `it is still in the world ${limit + 5} ticks after its death`;
    });

/** The scenarios of the damage, environment and senses theme. */
export const damageScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'death-animation',
        java: "A dead living entity stays in the world through its death animation, LivingEntity.tickDeath's 20 ticks, and only then leaves; an armor stand leaves at once.",
        reference: 'Java LivingEntity.tickDeath and ArmorStand.kill, read from the pinned jar; issue #3263',
        subjects: () => livingSubjects().filter((subject) => subject.javaId !== 'minecraft:ender_dragon'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const java = javaDeathTicks(subject.javaId);
            const server = deathTicksOnServer(subject.bedrock, java);
            if (typeof server === 'string') return server;
            return server === java ? undefined : `it leaves ${server} ticks after its death, where Java takes ${java}`;
        }
    },
    {
        name: 'lava-hurts',
        java: "A living entity in lava takes Java's lava damage on the first tick and every half second after, unless its type is fireImmune, which lava never hurts.",
        reference:
            'Java Entity.lavaHurt (hurtServer lava 4 unless fireImmune), LivingEntity.hurtServer (invulnerableTime above 10 turns a blow aside) and EntityTypes.<clinit> (EntityType.Builder.fireImmune), read from the pinned jar',
        subjects: lavaSubjects,
        idOf: (subject) => subject.javaId,
        aspects: lavaAspects,
        run: (subject) => {
            const lava = javaNumber(ENTITY, 'lavaHurt', '.hurtServer', 'before');
            const immune = javaFireImmune(subject.javaId);
            const run = inSandbox(subject.bedrock, 'minecraft:lava', (sandbox) => {
                const health = sandbox.entity.instance.attributes.get('health')?.current;
                let inLava = false;
                const hits = sandbox.tick(HAZARD_TICKS, () => {
                    inLava ||= sandbox.entity.body.conditions.has('in_lava');
                });
                // A blow straight through the pipeline, so a type that flew clear of the pool
                // still answers for its immunity. Only a survivor takes it.
                const direct =
                    sandbox.stack.runtime.byId(sandbox.entity.id) === undefined || !immune
                        ? undefined
                        : sandbox.stack.runtime.damage({
                              target: sandbox.entity.id,
                              cause: 'lava',
                              amount: lava,
                              source: { route: 'component', feedback: false, remembered: false }
                          });
                return { health, inLava, direct, hits: hits.filter((hit) => hit.cause === 'lava' && hit.taken > 0) };
            });
            if (typeof run === 'string') return run;
            if (run.health === undefined) return `the server spawns ${subject.bedrock} with no health`;
            if (!run.inLava && !immune) return 'the server never finds it in the lava around it';
            const java = immune ? [] : cooldownHits(lava, HAZARD_TICKS, run.health);
            const differences: string[] = [];
            if (!sameHits(run.hits, java))
                differences.push(
                    `lava hits it for ${describeHits(run.hits)}, where Java hits it for ${describeHits(java)}`
                );
            if (run.direct !== undefined && run.direct.committed && run.direct.taken > 0)
                differences.push(
                    `a lava blow takes ${run.direct.taken} health off it, which Java's fireImmune turns aside`
                );
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'water-hurts',
        java: "A living entity Java makes sensitive to water takes Java's drowning blow in water every half second, and no other entity is hurt by water before its air runs out.",
        reference:
            'Java LivingEntity.aiStep (isSensitiveToWater and isInWaterOrRain: hurtServer drown 1), overridden by Blaze, Enderman, SnowGolem and Strider, read from the pinned jar',
        subjects: () =>
            entitiesDeclaring('minecraft:hurt_on_condition').filter(
                (subject) => javaLiving(subject.javaId) && subject.javaId !== 'minecraft:player'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:hurt_on_condition'],
        run: (subject) => {
            const drown = javaNumber(LIVING, 'aiStep', 'DamageSources.drown', 'after');
            // Full lungs, so the run sees the water itself and not the air running out.
            const run = inSandbox(subject.bedrock, 'minecraft:water', (sandbox) => {
                const health = sandbox.entity.instance.attributes.get('health')?.current;
                const state = sandbox.entity.instance.componentState.get(AIR_STATE);
                if (state !== undefined)
                    sandbox.entity.instance.componentState.set(AIR_STATE, { ...state, remaining: 10 * HAZARD_TICKS });
                return { health, hits: sandbox.tick(HAZARD_TICKS) };
            });
            if (typeof run === 'string') return run;
            if (run.health === undefined) return `the server spawns ${subject.bedrock} with no health`;
            const java = javaSensitiveToWater(subject.javaId) ? cooldownHits(drown, HAZARD_TICKS, run.health) : [];
            const server = run.hits.filter((hit) => hit.taken > 0);
            return sameHits(server, java)
                ? undefined
                : `water hurts it for ${describeHits(server)}, where Java hurts it for ${describeHits(java)}`;
        }
    },
    {
        name: 'runs-out-of-air',
        java: "An entity out of air in a medium it cannot breathe takes Java's drowning blow once its air reaches -20 and every 20 ticks after, and regains air at Java's rate in a medium it breathes; its lungs hold Java's air supply.",
        reference:
            'Java LivingEntity.baseTick (decreaseAirSupply, shouldTakeDrowningDamage at -20, hurtServer drown 2), Entity.getMaxAirSupply and its overrides, and handleAirSupply in WaterAnimal, AgeableWaterCreature, Axolotl and Nautilus, read from the pinned jar; issue #3149',
        subjects: () =>
            entitiesDeclaring('minecraft:breathable').filter(
                (subject) => javaLiving(subject.javaId) && subject.javaId !== 'minecraft:player'
            ),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:breathable'],
        run: (subject) => {
            const java = javaAir(subject.javaId);
            const drown = javaNumber(LIVING, 'baseTick', 'DamageSources.drown', 'after');
            const threshold = -(pushedNumbers(javaMethod(LIVING, 'shouldTakeDrowningDamage'))[0] ?? 0);
            const cadence = [
                { tick: threshold, amount: drown },
                { tick: 2 * threshold, amount: drown }
            ];
            const differences: string[] = [];

            const media: readonly { medium: SandboxMedium; label: string; java: typeof cadence | undefined }[] = [
                {
                    medium: 'minecraft:water',
                    label: 'under water',
                    // Water that hurts on its own has the water-hurts row.
                    java:
                        java.handler !== undefined && STRANDED_HANDLERS.has(java.handler)
                            ? []
                            : java.breathesUnderwater === undefined || javaSensitiveToWater(subject.javaId)
                              ? undefined
                              : java.breathesUnderwater
                                ? []
                                : cadence
                },
                {
                    medium: 'air',
                    label: 'out of water',
                    // The axolotl's drying out has an aspect of its own.
                    java:
                        java.handler === 'Axolotl'
                            ? undefined
                            : java.handler !== undefined && STRANDED_HANDLERS.has(java.handler)
                              ? cadence
                              : []
                }
            ];
            for (const { medium, label, java: expected } of media) {
                if (expected === undefined) continue;
                const run = inSandbox(subject.bedrock, medium, (sandbox) => {
                    const state = sandbox.entity.instance.componentState.get(AIR_STATE);
                    if (state !== undefined)
                        sandbox.entity.instance.componentState.set(AIR_STATE, { ...state, remaining: 0 });
                    const hits = sandbox.tick(2 * threshold + 5).filter((hit) => hit.taken > 0);
                    return {
                        supply: state?.remaining,
                        air: sandbox.entity.instance.componentState.get(AIR_STATE)?.remaining,
                        hits
                    };
                });
                if (typeof run === 'string') return run;
                if (!sameHits(run.hits, expected))
                    differences.push(
                        `${label} with no air left the server hurts it for ${describeHits(run.hits)}, where Java hurts it for ${describeHits(expected)}`
                    );
                if (expected.length > 0 && run.supply !== java.max)
                    differences.push(
                        `its air lasts ${String(run.supply)} ticks ${label}, where Java's lasts ${java.max}`
                    );
                // In a medium it breathes, Java's water breathers fill their lungs at once and
                // everything else regains `increaseAirSupply`'s amount a tick.
                const regained =
                    java.handler !== undefined && STRANDED_HANDLERS.has(java.handler)
                        ? java.max
                        : Math.min(
                              java.max,
                              (2 * threshold + 5) *
                                  javaNumber(LIVING, 'increaseAirSupply', '.getMaxAirSupply', 'before')
                          );
                if (expected.length === 0 && run.air !== undefined && run.air !== regained && run.supply === java.max)
                    differences.push(
                        `${label} it regains ${run.air} air in ${2 * threshold + 5} ticks, where Java regains ${regained}`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    ...immunityScenarios,
    ...projectileScenarios,
    ...strikeScenarios,
    ...explosionScenarios,
    ...conditionScenarios,
    ...projectileHitScenarios,
    ...playerRuleScenarios
];
