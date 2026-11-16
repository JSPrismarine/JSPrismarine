/**
 * Java's goal parameters, written into the vanilla entity files as they load.
 *
 * Mob AI is the server's alone: the client runs none of it and only draws where the mob ends up.
 * So where a vanilla Bedrock goal is tuned differently from the Java goal that does the same job,
 * Java's number decides, the way a stat Java decides does
 * ([ADR 0001](../../../../docs/adr/0001-entity-stat-authority.md)). A goal Java's class does not
 * register at all comes off the file, and a goal Java runs under another rule is swapped for the
 * Bedrock goal that runs Java's rule. The goals themselves stay Bedrock's, so a behavior pack that
 * declares one gets the Bedrock behavior its file asks for. A ruling may also reach a component
 * that only exists to drive a goal, such as the sensor that lights a creeper's fuse.
 */
import { LAND_ON_OWNERS_SHOULDER } from '@jsprismarine/entity-goals/goals/shoulder';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentReplaced } from './definitionOverlay';
import { under } from './javaComponentTuning';

/** The Bedrock potion ids of Java's `Potions.SWIFTNESS` and `Potions.INVISIBILITY`. */
const SWIFTNESS_POTION = 14;
const INVISIBILITY_POTION = 7;

/** One Java ruling over a vanilla goal: the components that take the declared goal's place. */
interface JavaGoalRuling {
    /** The Java entity type, which `@jsprismarine/mapping` turns into the Bedrock one. */
    readonly entity: string;
    /** The Bedrock goal the ruling rewrites. */
    readonly component: string;
    /** Builds the components that replace the declared body; an empty record removes the goal. */
    readonly java: (body: Record<string, unknown>) => Readonly<Record<string, Record<string, unknown>>>;
}

/**
 * Keeps a component and overwrites the parameters it declares with Java's. A body that leaves one
 * out keeps it out: the creeper's forced-explosion groups declare an empty sensor to switch the
 * base one off, and filling it in would switch it back on.
 */
const tuned =
    (component: string, parameters: Record<string, unknown>) =>
    (body: Record<string, unknown>): Readonly<Record<string, Record<string, unknown>>> => ({
        [component]: {
            ...body,
            ...Object.fromEntries(Object.entries(parameters).filter(([name]) => name in body))
        }
    });

/** Takes a goal off, because Java's class registers nothing that does its job. */
const absent = (): Readonly<Record<string, Record<string, unknown>>> => ({});

/** Every ruling, each with the Java source that decides it. */
const JAVA_GOAL_RULINGS: readonly JavaGoalRuling[] = [
    {
        // Java `SwellGoal.canUse` starts at `distanceToSqr < 9`, strictly under 3 blocks, and
        // `SwellGoal.tick` stops past 49.
        entity: 'minecraft:creeper',
        component: 'minecraft:behavior.swell',
        java: tuned('minecraft:behavior.swell', { start_distance: under(3), stop_distance: 7 })
    },
    {
        // The same `SwellGoal` distances, where the creeper's file lights the fuse.
        entity: 'minecraft:creeper',
        component: 'minecraft:target_nearby_sensor',
        java: tuned('minecraft:target_nearby_sensor', { inside_range: under(3), outside_range: 7 })
    },
    {
        // Java `Fox.PerchAndSearchGoal.canUse` rolls `random.nextFloat() < 0.02`.
        entity: 'minecraft:fox',
        component: 'minecraft:behavior.random_look_around_and_sit',
        java: tuned('minecraft:behavior.random_look_around_and_sit', { probability: 0.02 })
    },
    {
        // Java `Fox.aiStep` eats the food in its mouth once `ticksSinceEaten > 600`, where Bedrock waits 28 seconds.
        entity: 'minecraft:fox',
        component: 'minecraft:behavior.eat_carried_item',
        java: tuned('minecraft:behavior.eat_carried_item', { delay_before_eating: 30 })
    },
    {
        // Java `Cat.CatRelaxOnOwnerGoal.giveMorningGift` rolls the `gameplay/cat_morning_gift` table.
        entity: 'minecraft:cat',
        component: 'minecraft:behavior.drop_item_for',
        java: tuned('minecraft:behavior.drop_item_for', { loot_table: 'loot_tables/gameplay/cat_morning_gift.json' })
    },
    {
        // Java `Panda.afterSneeze` rolls the `gameplay/panda_sneeze` table on every sneeze; the
        // table's one slime ball in 700 is the whole chance, with no roll in front of it.
        entity: 'minecraft:panda',
        component: 'minecraft:behavior.sneeze',
        java: tuned('minecraft:behavior.sneeze', {
            loot_table: 'loot_tables/gameplay/panda_sneeze.json',
            drop_item_chance: 1
        })
    },
    {
        // Java `Dolphin.registerGoals` adds `DolphinJumpGoal(this, 10)`, which rolls
        // `reducedTickDelay(10)`: one selector pass in 5.
        entity: 'minecraft:dolphin',
        component: 'minecraft:behavior.random_breach',
        java: tuned('minecraft:behavior.random_breach', { interval: 5 })
    },
    {
        // Java `Strider.registerGoals` adds `StriderGoToLavaGoal(this, 1.0)`, a `MoveToBlockGoal`
        // with a search range of 8 and a vertical range of 2: `findNearestBlock` scans offsets
        // below the range, so lava up to 7 blocks across.
        entity: 'minecraft:strider',
        component: 'minecraft:behavior.move_to_liquid',
        java: tuned('minecraft:behavior.move_to_liquid', { search_range: 7, search_height: 2, speed_multiplier: 1 })
    },
    {
        // Java `Strider.floatStrider` lifts a strider in lava by 0.05 a tick.
        entity: 'minecraft:strider',
        component: 'minecraft:behavior.rise_to_liquid_level',
        java: tuned('minecraft:behavior.rise_to_liquid_level', { rise_delta: 0.05 })
    },
    {
        // Java `IronGolem.registerGoals` adds `GolemRandomStrollInVillageGoal`, which has no time of day.
        entity: 'minecraft:iron_golem',
        component: 'minecraft:behavior.move_through_village',
        java: tuned('minecraft:behavior.move_through_village', { only_at_night: false })
    },
    {
        // Java `Bee.BeeWanderGoal` draws `HoverRandomPos.getPos(bee, 8, 7, ..., 3, 1)`: a spot 1 to 3
        // blocks above the solid block it lands on.
        entity: 'minecraft:bee',
        component: 'minecraft:behavior.random_hover',
        java: tuned('minecraft:behavior.random_hover', { hover_height: [1, 3], y_offset: 0 })
    },
    {
        // Java `Panda.PandaSitGoal` sits only to eat, which `minecraft:behavior.snacking` runs.
        entity: 'minecraft:panda',
        component: 'minecraft:behavior.random_sitting',
        java: absent
    },
    {
        // Java's `Bat` registers no goals, so `java_entity_goals` has no entry for it, and
        // `Bat.customServerAiStep` flies it out of water rather than a `FloatGoal` jumping it.
        entity: 'minecraft:bat',
        component: 'minecraft:behavior.float',
        java: absent
    },
    {
        // Java `Parrot.registerGoals` adds `LandOnOwnersShoulderGoal`, which seats a tamed parrot on
        // the owner it touches; Bedrock's `find_mount` walks it to any mount within 16 blocks.
        entity: 'minecraft:parrot',
        component: 'minecraft:behavior.find_mount',
        java: ({ priority }) => ({ [LAND_ON_OWNERS_SHOULDER]: priority === undefined ? {} : { priority } })
    },
    {
        // Java `Cat.registerGoals` has no goal that walks a cat to a village.
        entity: 'minecraft:cat',
        component: 'minecraft:behavior.move_towards_dwelling_restriction',
        java: absent
    },
    ...['minecraft:squid', 'minecraft:glow_squid'].map((entity) => ({
        // Java `Squid.registerGoals` puts `SquidFleeGoal` above `SquidRandomMovementGoal`, so a hurt
        // squid flees whatever it was drifting toward; Bedrock gives every state priority 2.
        entity,
        component: 'minecraft:behavior.squid_flee',
        java: tuned('minecraft:behavior.squid_flee', { priority: 1 })
    })),
    {
        // Java `Witch.aiStep` drinks swiftness on `random.nextFloat() < 0.5F`, where Bedrock rolls 0.25.
        entity: 'minecraft:witch',
        component: 'minecraft:behavior.drink_potion',
        java: (body) => ({
            'minecraft:behavior.drink_potion': {
                ...body,
                potions: (Array.isArray(body['potions']) ? body['potions'] : []).map((potion: unknown) =>
                    isRecord(potion) && potion['id'] === SWIFTNESS_POTION ? { ...potion, chance: 0.5 } : potion
                )
            }
        })
    },
    {
        // Java `WanderingTrader.registerGoals` drinks invisibility whenever `isDarkOutside()` and it
        // is visible, where Bedrock's file waits until it is also fleeing a mob.
        entity: 'minecraft:wandering_trader',
        component: 'minecraft:behavior.drink_potion',
        java: (body) => ({
            'minecraft:behavior.drink_potion': {
                ...body,
                potions: [
                    {
                        id: INVISIBILITY_POTION,
                        chance: 1,
                        filters: {
                            all_of: [
                                { test: 'is_daytime', value: false },
                                { test: 'is_visible', subject: 'self', value: true }
                            ]
                        }
                    }
                ]
            }
        })
    },
    {
        // And milk whenever `isBrightOutside()` and it is invisible.
        entity: 'minecraft:wandering_trader',
        component: 'minecraft:behavior.drink_milk',
        java: (body) => ({
            'minecraft:behavior.drink_milk': {
                ...body,
                filters: {
                    all_of: [
                        { test: 'is_daytime', value: true },
                        { test: 'is_visible', subject: 'self', value: false }
                    ]
                }
            }
        })
    },
    {
        // Java `WitherBoss.registerGoals` targets with `HurtByTargetGoal`, which takes the last attacker.
        entity: 'minecraft:wither',
        component: 'minecraft:behavior.wither_target_highest_damage',
        java: ({ priority }) => ({ 'minecraft:behavior.hurt_by_target': priority === undefined ? {} : { priority } })
    }
];

/** The rulings for each Bedrock entity, by Bedrock identifier. */
export type JavaGoalRulings = ReadonlyMap<string, readonly JavaGoalRuling[]>;

/** Resolves {@link JAVA_GOAL_RULINGS} to the Bedrock entities they apply to. */
export const javaGoalRulings = (): JavaGoalRulings => {
    const rulings = new Map<string, JavaGoalRuling[]>();
    for (const ruling of JAVA_GOAL_RULINGS) {
        const mapped = javaEntityTypeToBedrock(ruling.entity);
        if (mapped.kind !== 'mapped') continue;
        rulings.set(mapped.bedrock, [...(rulings.get(mapped.bedrock) ?? []), ruling]);
    }
    return rulings;
};

/**
 * Applies Java's goal rulings to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @param rulings - The rulings of each entity, from {@link javaGoalRulings}.
 * @returns The same object for a file with no ruling; otherwise a copy with each ruled goal
 *   replaced, in its base components and in each component group.
 */
export const withJavaGoals = (data: unknown, rulings: JavaGoalRulings): unknown => {
    const identifier = entityFileIdentifier(data);
    const own = identifier === undefined ? undefined : rulings.get(identifier);
    if (own === undefined) return data;
    return own.reduce((file, ruling) => withComponentReplaced(file, ruling.component, ruling.java), data);
};
