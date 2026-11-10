/**
 * The guards and modifier slots of a data-driven entity's damage pipeline, in their order.
 *
 * Guards, as ADR 0013 orders them:
 *
 * 1. `present` (pack): the target is in the store, alive, not already dying and has health.
 * 2. `invulnerable` (pack): the record's invulnerable flag, as the respawn sequence's end
 *    crystals carry.
 * 3. `damage_resistant` (pack): a dropped stack whose item's `minecraft:damage_resistant` names
 *    the cause, such as a nether star in a blast.
 * 4. `hit_grace` (pack): the half second after a hit during which a weaker blow is ignored.
 * 5. `cannot_be_attacked` (pack): `minecraft:cannot_be_attacked` and the type rules an attacker
 *    in the store declares.
 * 6. `dragon` (pack): Java's `EnderDragon.hurt` rules, which the Bedrock pack does not carry.
 * 7. `damage_sensor` (pack): a `minecraft:damage_sensor` that does not deal damage, or an
 *    immunity component, replaces the amount with zero. The blow still commits, so the sensor's
 *    event fires and the hurt observers see it, which is what Bedrock does.
 * 8. Game rules: `fireDamage` for a burning entity.
 * 9. Before-hooks, which a host adds.
 *
 * Modifier slots, lowest priority first: the grace period's difference, armor, protection
 * enchantments, resistance, absorption, the dragon's scaling and the damage sensor's multiplier.
 */
import type { DamageSensing, FilterEntityView } from '@jsprismarine/entities';

import { DamageCause } from '../DamageCause';
import { armorFactor, protectionFactor, resistanceFactor } from '../Damage';
import type { DataEntity } from './DataEntity';
import type { DamageGuard, DamageIntent, DamageModifierSlot } from './damagePipeline';
import { PASS, VETO, replaceAmount } from './damagePipeline';

/** The grace period of one entity: ticks left and the blow it is measuring against. */
export interface HitGrace {
    readonly ticks: number;
    readonly last: number;
}

/** What armor, enchantments and effects a target meets a blow with. */
export interface DamageMitigation {
    readonly defensePoints: number;
    readonly toughness: number;
    readonly enchantmentProtection: number;
}

/** What the stages read. Nothing here writes. */
export interface DamageStageReads {
    /** The target, when the store holds it. */
    target(id: number): DataEntity | undefined;
    /** Whether the target's death is already running. */
    dying(id: number): boolean;
    /** The attacker, when the store holds it, for the type rules it declares. */
    storeEntity(id: number): DataEntity | undefined;
    /** Whether a runtime id names a player. */
    isPlayer(id: number): boolean;
    /** The filter view of whoever dealt a blow, for the sensor's filters. */
    damagerView(id: number): FilterEntityView | undefined;
    /** Whether a game rule is on. */
    gameRule(rule: 'fireDamage'): boolean;
    /** The target's grace period, or undefined when none is running. */
    grace(id: number): HitGrace | undefined;
    /** What the target wears against this blow. Undefined means nothing. */
    mitigation?(target: DataEntity, intent: DamageIntent): DamageMitigation | undefined;
    /** Whether an attacker's type rules allow it to hurt the target. */
    canAttack(attacker: DataEntity, target: DataEntity): boolean;
    /** Whether the target turns a cause aside whole, as a dropped nether star does a blast. */
    resists?(target: DataEntity, cause: string): boolean;
}

/** Causes whose `cannot_be_attacked` and type rules are asked, which is every blow an entity deals. */
const ATTACK_CAUSES: ReadonlySet<string> = new Set(['entity_attack', 'entity_explosion', 'projectile']);

/** Causes `fireDamage` turns aside. Only the burning tick asked it before the pipeline existed. */
const FIRE_RULE_CAUSES: ReadonlySet<string> = new Set(['fire_tick']);

/** Java's floor under a hit on the dragon. */
const DRAGON_MINIMUM_DAMAGE = 0.01;

/** The dragon's scaling of one blow, Java's body hit: a quarter of it plus the amount capped at one. */
const dragonScaled = (amount: number): number => amount / 4 + Math.min(amount, 1);

/**
 * The sensing of the run in progress.
 *
 * The sensor guard reads it, and the multiplier slot and the commit read the same answer, so a
 * blow is sensed once. A death inside a commit can start another run, which replaces it, so the
 * commit takes its copy before it does anything.
 */
export class DamageSensingSlot {
    private sensed: { readonly intent: DamageIntent; readonly sensing: DamageSensing } | undefined;

    public constructor(private readonly reads: DamageStageReads) {}

    /** Senses a blow, or answers the sensing already taken for it. */
    public of(intent: DamageIntent): DamageSensing | undefined {
        const sensed = this.sensed;
        if (
            sensed !== undefined &&
            sensed.intent.target === intent.target &&
            sensed.intent.cause === intent.cause &&
            sensed.intent.attacker === intent.attacker
        )
            return sensed.sensing;
        const target = this.reads.target(intent.target);
        if (target === undefined) return undefined;

        const damager = intent.attacker === undefined ? undefined : this.reads.damagerView(intent.attacker);
        const sensing = target.instance.senseDamage({ cause: intent.cause, amount: intent.amount, damager });
        this.sensed = { intent, sensing };
        return sensing;
    }

    /** Forgets the sensing, so the next run senses its own blow. */
    public clear(): void {
        this.sensed = undefined;
    }
}

/** Whether a blow lands inside a running grace period. */
const inGrace = (intent: DamageIntent, grace: HitGrace | undefined): grace is HitGrace =>
    intent.source.graced === true && intent.source.bypassesGrace !== true && grace !== undefined && grace.ticks > 0;

/** The pack and game-rule guards, in their order. */
export const damageGuards = (reads: DamageStageReads, sensing: DamageSensingSlot): readonly DamageGuard[] => [
    {
        name: 'present',
        stage: 'pack',
        check: (intent) => {
            const target = reads.target(intent.target);
            if (target === undefined || target.removed !== undefined || reads.dying(intent.target)) return VETO;
            const health = target.instance.attributes.get('health');
            return health === undefined || health.current <= 0 ? VETO : PASS;
        }
    },
    {
        name: 'invulnerable',
        stage: 'pack',
        check: (intent) => (reads.target(intent.target)?.body.invulnerable === true ? VETO : PASS)
    },
    {
        name: 'damage_resistant',
        stage: 'pack',
        check: (intent) => {
            const target = reads.target(intent.target);
            return target !== undefined && reads.resists?.(target, intent.cause) === true ? VETO : PASS;
        }
    },
    {
        name: 'hit_grace',
        stage: 'pack',
        check: (intent) => {
            const grace = reads.grace(intent.target);
            return inGrace(intent, grace) && intent.amount <= grace.last ? VETO : PASS;
        }
    },
    {
        name: 'cannot_be_attacked',
        stage: 'pack',
        check: (intent) => {
            if (intent.attacker === undefined || !ATTACK_CAUSES.has(intent.cause)) return PASS;
            const attacker = reads.storeEntity(intent.attacker);
            const target = reads.target(intent.target);
            if (attacker === undefined || target === undefined) return PASS;
            return reads.canAttack(attacker, target) ? PASS : VETO;
        }
    },
    {
        name: 'dragon',
        stage: 'pack',
        check: (intent) => {
            const target = reads.target(intent.target);
            if (target === undefined || intent.amount <= 0 || !target.instance.families().includes('dragon'))
                return PASS;
            // A dying dragon ignores damage, and a `/kill` lands whole, as Java's
            // `EnderDragon.kill` override takes the dragon out regardless of its rules.
            if (target.instance.hasComponent('minecraft:behavior.dragondeath')) return VETO;
            if (intent.cause === DamageCause.SelfDestruct) return PASS;

            // A hit counts only when a player dealt it or an explosion caused it, which is Java's
            // `#always_hurts_ender_dragons` tag.
            const isExplosion = intent.cause === 'entity_explosion' || intent.cause === 'block_explosion';
            const fromPlayer = intent.attacker !== undefined && reads.isPlayer(intent.attacker);
            if (!isExplosion && !fromPlayer) return VETO;
            return dragonScaled(intent.amount) < DRAGON_MINIMUM_DAMAGE ? VETO : PASS;
        }
    },
    {
        name: 'damage_sensor',
        stage: 'pack',
        check: (intent) => (sensing.of(intent)?.blocked === true ? replaceAmount(0) : PASS)
    },
    {
        name: 'fire_damage',
        stage: 'game_rule',
        check: (intent) => (FIRE_RULE_CAUSES.has(intent.cause) && !reads.gameRule('fireDamage') ? VETO : PASS)
    }
];

/** The resistance level a target is under, which is the effect's amplifier plus one. */
const resistanceOf = (target: DataEntity): number => {
    const resistance = target.body.statusEffects.get('minecraft:resistance');
    return resistance === undefined ? 0 : resistance.amplifier + 1;
};

/** The modifier slots, each with its priority. */
export const damageModifiers = (reads: DamageStageReads, sensing: DamageSensingSlot): readonly DamageModifierSlot[] => {
    const mitigationOf = (intent: DamageIntent): DamageMitigation | undefined => {
        if (intent.source.mitigated !== true) return undefined;
        const target = reads.target(intent.target);
        return target === undefined ? undefined : reads.mitigation?.(target, intent);
    };
    return [
        {
            // A harder blow than the one still running gets through, for the difference.
            name: 'hit_grace',
            priority: 100,
            modifier: (intent) => {
                const grace = reads.grace(intent.target);
                return inGrace(intent, grace) ? { operation: 'add', value: -grace.last } : undefined;
            }
        },
        {
            name: 'armor',
            priority: 200,
            modifier: (intent, amount) => {
                const mitigation = mitigationOf(intent);
                if (mitigation === undefined || intent.source.bypassesArmor === true || amount <= 0) return undefined;
                if (mitigation.defensePoints <= 0) return undefined;
                return {
                    operation: 'multiply',
                    value: armorFactor(amount, mitigation.defensePoints, mitigation.toughness)
                };
            }
        },
        {
            name: 'protection',
            priority: 300,
            modifier: (intent, amount) => {
                const mitigation = mitigationOf(intent);
                if (mitigation === undefined || intent.source.bypassesEnchantments === true || amount <= 0)
                    return undefined;
                if (mitigation.enchantmentProtection <= 0) return undefined;
                return { operation: 'multiply', value: protectionFactor(mitigation.enchantmentProtection) };
            }
        },
        {
            name: 'resistance',
            priority: 400,
            modifier: (intent, amount) => {
                const target = reads.target(intent.target);
                if (intent.source.mitigated !== true || target === undefined || amount <= 0) return undefined;
                const level = resistanceOf(target);
                return level <= 0 ? undefined : { operation: 'multiply', value: resistanceFactor(level) };
            }
        },
        {
            // Extra hearts in front of the real ones, spent first. The commit writes what was spent.
            name: 'absorption',
            priority: 450,
            modifier: (intent, amount) => {
                const target = reads.target(intent.target);
                if (intent.source.mitigated !== true || target === undefined || amount <= 0) return undefined;
                const absorption = target.instance.attributes.get('absorption')?.current ?? 0;
                return absorption <= 0 ? undefined : { operation: 'add', value: -Math.min(absorption, amount) };
            }
        },
        {
            name: 'dragon',
            priority: 500,
            modifier: (intent, amount) => {
                const target = reads.target(intent.target);
                if (target === undefined || amount <= 0 || !target.instance.families().includes('dragon'))
                    return undefined;
                if (intent.cause === DamageCause.SelfDestruct) return undefined;
                // With no head part on this server every hit is a body hit.
                return { operation: 'multiply', value: dragonScaled(amount) / amount };
            }
        },
        {
            name: 'damage_sensor',
            priority: 600,
            modifier: (intent) => {
                const multiplier = sensing.of(intent)?.multiplier ?? 1;
                return multiplier === 1 ? undefined : { operation: 'multiply', value: multiplier };
            }
        }
    ];
};
