/**
 * Java's rules for the few components a vanilla entity file writes differently from Java's
 * class, rewritten into each file as it loads.
 *
 * Each rule is a server-decided number the client never draws, so Java decides it, the way
 * Java's air supply does in `javaAirSupply.ts`
 * ([ADR 0001](../../../../docs/adr/0001-entity-stat-authority.md)). The parity suite reads the
 * same numbers out of the pinned Java jar and fails when one drifts.
 */
import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentRewritten } from './definitionOverlay';

/** One component of one entity file that Java's class decides. */
interface JavaComponentRule {
    readonly component: string;
    /**
     * The body Java's class means, or undefined when Java's type has no such behavior at all.
     * `group` names the component group that declares the body, undefined for the base components.
     */
    readonly rewrite: (body: Record<string, unknown>, group: string | undefined) => Record<string, unknown> | undefined;
}

/** The range `TimeUtil.rangeOfSeconds(20, 39)` draws a Java neutral mob's anger from, in seconds. */
const JAVA_ANGER_SECONDS = { min: 20, max: 39 } as const;

/** A filter with every `is_family` test of one family taken out of its `any_of`. */
const withoutFamily = (filter: unknown, family: string): unknown => {
    if (!isRecord(filter) || !Array.isArray(filter.any_of)) return filter;
    return {
        ...filter,
        any_of: filter.any_of.filter((test) => !(isRecord(test) && test.test === 'is_family' && test.value === family))
    };
};

/** Whether a filter tests the water the entity stands or swims in. */
const isWaterTest = (filter: unknown): boolean =>
    isRecord(filter) && (filter.test === 'is_underwater' || filter.test === 'in_water');

/**
 * An environment sensor that picks the weapon goal by the weapon alone. Java's
 * `AbstractSkeleton.reassessWeaponGoal` chooses `RangedBowAttackGoal` whenever the skeleton holds
 * a bow, and `Pillager.registerGoals` adds only `RangedCrossbowAttackGoal`, so neither reads the
 * water. The pack swaps to melee under water and back only out of it.
 */
const withoutWaterWeaponSwap = (body: Record<string, unknown>): Record<string, unknown> => {
    const triggers: readonly unknown[] = Array.isArray(body.triggers) ? body.triggers : [body.triggers];
    const kept = triggers.flatMap((trigger): unknown[] => {
        if (!isRecord(trigger)) return [trigger];
        const { filters, ...rest } = trigger;
        if (trigger.event === 'minecraft:melee_mode' && isWaterTest(filters)) return [];
        if (trigger.event !== 'minecraft:ranged_mode') return [trigger];
        if (isWaterTest(filters)) return [rest];
        if (isRecord(filters) && Array.isArray(filters.all_of))
            return [
                { ...trigger, filters: { ...filters, all_of: filters.all_of.filter((test) => !isWaterTest(test)) } }
            ];
        return [trigger];
    });
    return { ...body, triggers: kept };
};

/**
 * `AbstractBoat.tickBubbleColumn` drags a boat under after its own 60-tick count and leaves it its
 * seats (`boatBubbleColumn.ts`). The pack's sinking-column group instead raises
 * `minecraft:sink` from a three-second timer, which takes the boat's seats and buoyancy away.
 */
const BOAT_SINKS_BY_JAVA_COUNT: JavaComponentRule = {
    component: 'minecraft:timer',
    rewrite: (body, group) => (group === 'minecraft:above_bubble_column_down' ? undefined : body)
};

/** An environment sensor without the triggers that raise one event. */
const withoutTriggerFor = (body: Record<string, unknown>, event: string): Record<string, unknown> => {
    const triggers: readonly unknown[] = Array.isArray(body.triggers) ? body.triggers : [body.triggers];
    return { ...body, triggers: triggers.filter((trigger) => !(isRecord(trigger) && trigger.event === event)) };
};

/** An environment sensor whose triggers that raise one event test a new filter instead. */
const withTriggerFilter = (body: Record<string, unknown>, event: string, filters: unknown): Record<string, unknown> => {
    const triggers: readonly unknown[] = Array.isArray(body.triggers) ? body.triggers : [body.triggers];
    return {
        ...body,
        triggers: triggers.map((trigger) =>
            isRecord(trigger) && trigger.event === event ? { ...trigger, filters } : trigger
        )
    };
};

/** A wild mount with a mob in its first seat, Java's `!isTamed() && isMobControlled()`. */
const WILD_HORSE_MOB_RIDDEN = {
    all_of: [
        { test: 'is_controlling_passenger_family', subject: 'self', value: 'mob' },
        { test: 'has_component', subject: 'self', operator: '!=', value: 'minecraft:is_tamed' }
    ]
};

const WEAPON_BY_WEAPON_ALONE: JavaComponentRule = {
    component: 'minecraft:environment_sensor',
    rewrite: withoutWaterWeaponSwap
};

/** Java's `Float.MAX_VALUE`, the blow `Parrot.mobInteract` deals a parrot that eats a cookie. */
const FLOAT_MAX_VALUE = 3.4028234663852886e38;

/** Ticks of Poison `Parrot.mobInteract` gives a parrot that eats a cookie. */
const PARROT_POISON_TICKS = 900;

/** Whether a healable item entry poisons the entity fatally, the pack's stand-in for Java's cookie rule. */
const poisonsFatally = (entry: unknown): boolean =>
    isRecord(entry) &&
    Array.isArray(entry.effects) &&
    entry.effects.some((effect) => isRecord(effect) && effect.name === 'fatal_poison');

/** The rules by Bedrock entity identifier. */
export const JAVA_COMPONENT_RULES: Readonly<Record<string, readonly JavaComponentRule[]>> = {
    // `Axolotl.handleAirSupply` dries an axolotl out on land by 2 `dryOut` damage each time its
    // air reaches -20, a second apart. Bedrock's dried-out group hurts it 1 every half second.
    // It starts with `Axolotl.getMaxAirSupply`'s 6000 ticks, so the first blow lands 6020 ticks
    // out of water: 301 seconds.
    'minecraft:axolotl': [
        {
            component: 'minecraft:damage_over_time',
            rewrite: (body) => ({ ...body, damage_per_hurt: 2, time_between_hurt: 1 })
        },
        { component: 'minecraft:drying_out_timer', rewrite: (body) => ({ ...body, total_time: 301 }) }
    ],
    // `MinecartTNT.<init>` sets `explosionPowerBase` to 4, which a minecart at rest explodes with.
    // `MinecartTNT` has no `interact`, so a player's flint and steel lights nothing: only fire,
    // damage and an activator rail prime it. The pack primes it from the hand.
    'minecraft:tnt_minecart': [
        { component: 'minecraft:explode', rewrite: (body) => ({ ...body, power: 4 }) },
        { component: 'minecraft:interact', rewrite: () => undefined }
    ],
    // Java's creaking is not in `freeze_immune_entity_types` and `Creaking` keeps `Entity.canFreeze`,
    // so powder snow freezes it.
    'minecraft:creaking': [{ component: 'minecraft:freezing_immune', rewrite: () => undefined }],
    // `Ghast.hurtServer` lets every blow land, so a mob may hurt a ghast as a player may.
    'minecraft:ghast': [{ component: 'minecraft:cannot_be_attacked', rewrite: () => undefined }],
    // `PolarBear.PERSISTENT_ANGER_TIME` is `TimeUtil.rangeOfSeconds(20, 39)`, where the pack keeps
    // an adult angry for 500 seconds. A baby's one-second anger only spreads it, and stays.
    'minecraft:polar_bear': [
        {
            component: 'minecraft:angry',
            rewrite: (body) =>
                typeof body.duration === 'number' && body.duration > JAVA_ANGER_SECONDS.max
                    ? {
                          ...body,
                          duration: (JAVA_ANGER_SECONDS.min + JAVA_ANGER_SECONDS.max) / 2,
                          duration_delta: (JAVA_ANGER_SECONDS.max - JAVA_ANGER_SECONDS.min) / 2
                      }
                    : body
        }
    ],
    // `Slime.push` hurts an iron golem it touches and no other mob, where the pack's big slimes
    // hurt snow golems too.
    'minecraft:slime': [
        {
            component: 'minecraft:area_attack',
            rewrite: (body) => ({ ...body, entity_filter: withoutFamily(body.entity_filter, 'snowgolem') })
        }
    ],
    // `Pufferfish.touch` deals a mob 1 plus its puff state, 3 when fully puffed, where the pack's
    // full puff deals 2.
    'minecraft:pufferfish': [
        { component: 'minecraft:area_attack', rewrite: (body) => ({ ...body, damage_per_tick: 3 }) }
    ],
    // `TraderLlama` never tames itself: one that leaves its trader's lead stays wild, for a player
    // to tame by riding, where the pack's sensor tames it the moment the lead is gone.
    'minecraft:trader_llama': [
        {
            component: 'minecraft:environment_sensor',
            rewrite: (body) => withoutTriggerFor(body, 'minecraft:on_tame')
        }
    ],
    // `ZombieHorse.canBeLeashed` refuses a lead only while it is wild and a mob rides it
    // (`isMobControlled`), where the pack's sensor takes the lead away from a tamed one too, and only
    // for a zombie rider.
    'minecraft:zombie_horse': [
        {
            component: 'minecraft:environment_sensor',
            rewrite: (body) => withTriggerFilter(body, 'minecraft:hostile_mounted', WILD_HORSE_MOB_RIDDEN)
        }
    ],
    'minecraft:skeleton': [WEAPON_BY_WEAPON_ALONE],
    'minecraft:stray': [WEAPON_BY_WEAPON_ALONE],
    'minecraft:bogged': [WEAPON_BY_WEAPON_ALONE],
    'minecraft:parched': [WEAPON_BY_WEAPON_ALONE],
    'minecraft:pillager': [WEAPON_BY_WEAPON_ALONE],
    // `AbstractNautilus.mobInteract` feeds a hurt tamed nautilus its food before `Animal.mobInteract`
    // breeds it, so the food heals it until it is at full health.
    'minecraft:nautilus': [
        { component: 'minecraft:breedable', rewrite: (body) => ({ ...body, require_full_health: true }) }
    ],
    // `Parrot.mobInteract` poisons a parrot that eats from `parrot_poisonous_food` for 900 ticks and
    // hurts it by `Float.MAX_VALUE`, which kills it at once. The pack's fatal poison only wears it down.
    'minecraft:parrot': [
        {
            component: 'minecraft:healable',
            rewrite: (body) => ({
                ...body,
                items: (Array.isArray(body.items) ? body.items : []).map((entry: unknown) =>
                    isRecord(entry) && poisonsFatally(entry)
                        ? {
                              ...entry,
                              heal_amount: -FLOAT_MAX_VALUE,
                              effects: [{ name: 'poison', duration: PARROT_POISON_TICKS / 20, amplifier: 0, chance: 1 }]
                          }
                        : entry
                )
            })
        }
    ],
    'minecraft:boat': [BOAT_SINKS_BY_JAVA_COUNT],
    'minecraft:chest_boat': [BOAT_SINKS_BY_JAVA_COUNT]
};

/**
 * Applies {@link JAVA_COMPONENT_RULES} to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for a file no rule names; otherwise a copy with each rule applied.
 */
export const withJavaComponentRules = (data: unknown): unknown => {
    const identifier = entityFileIdentifier(data);
    const rules = identifier === undefined ? undefined : JAVA_COMPONENT_RULES[identifier];
    return (rules ?? []).reduce((file, rule) => withComponentRewritten(file, rule.component, rule.rewrite), data);
};
