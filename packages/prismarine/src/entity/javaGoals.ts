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
import { TICKS_PER_SECOND } from '@jsprismarine/entities/hooks';
import {
    BLAZE_ATTACK,
    GHAST_SHOOT_FIREBALL,
    PHANTOM_ATTACK_PLAYER_TARGET,
    SHULKER_ATTACK
} from '@jsprismarine/entity-goals/goals/mobAttacks';
import { LAND_ON_OWNERS_SHOULDER } from '@jsprismarine/entity-goals/goals/shoulder';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentReplaced } from './definitionOverlay';
import { under } from './javaComponentTuning';

/**
 * The Bedrock potion ids of Java's `Potions.SWIFTNESS` and `Potions.INVISIBILITY`.
 *
 * @javaSource Potions.SWIFTNESS
 */
const SWIFTNESS_POTION = 14;
const INVISIBILITY_POTION = 7;

/** The priority of the blaze's attack: the one its file gives the ranged and melee goals it replaces, ahead of its stroll. */
const BLAZE_ATTACK_PRIORITY = 3;

/** One Java ruling over a vanilla goal: the components that take the declared goal's place. */
interface JavaGoalRuling {
    /** The Java entity type, which `@jsprismarine/mapping` turns into the Bedrock one. */
    readonly entity: string;
    /** The Bedrock goal the ruling rewrites. */
    readonly component: string;
    /**
     * Builds the components that replace the declared body, in the base components when `group`
     * is undefined and otherwise in that component group; an empty record removes the goal.
     */
    readonly java: (body: Record<string, unknown>, group?: string) => Readonly<Record<string, Record<string, unknown>>>;
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

/**
 * Adds goals Java's class registers and the file leaves out, beside a component the file declares
 * in its base components, so they run whichever component groups are active.
 */
const beside =
    (anchor: string, goals: Readonly<Record<string, Record<string, unknown>>>) =>
    (body: Record<string, unknown>, group?: string): Readonly<Record<string, Record<string, unknown>>> =>
        group === undefined ? { [anchor]: body, ...goals } : { [anchor]: body };

/** The component every vanilla mob file declares in its base components, which added goals sit beside. */
const PHYSICS = 'minecraft:physics';

/** Java `AbstractFish.registerGoals`: `PanicGoal(this, 1.25)` at priority 1, which the files leave out. */
const FISH_PANIC = beside(PHYSICS, {
    'minecraft:behavior.panic': { priority: 1, speed_multiplier: 1.25 }
});

/** The wither's flight toward its target, which its file declares in its base components. */
const WITHER_ATTACK_POS = 'minecraft:behavior.wither_random_attack_pos_goal';

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
        // Java `Bee$BeeWanderGoal.findPos` heads a wander toward the hive once the bee is
        // `getWanderThreshold` blocks from it, 48 less 24 for a bee with a hive.
        entity: 'minecraft:bee',
        component: 'minecraft:behavior.random_hover',
        java: (body) => ({ 'minecraft:behavior.random_hover': { ...body, home_steer_distance: 24 } })
    },
    {
        // Java `Blaze.registerGoals` adds `BlazeAttackGoal`, which bites inside 2 blocks and
        // otherwise charges and fires bursts of three. It runs whatever the range, so it goes in
        // the group of the sensor that is always on, beside the sensor, which still swaps the
        // blaze's melee damage in and out; it takes the place of the ranged and melee goals.
        entity: 'minecraft:blaze',
        component: 'minecraft:target_nearby_sensor',
        java: (body) => ({
            'minecraft:target_nearby_sensor': body,
            [BLAZE_ATTACK]: { priority: BLAZE_ATTACK_PRIORITY, projectile: 'minecraft:small_fireball' }
        })
    },
    { entity: 'minecraft:blaze', component: 'minecraft:behavior.ranged_attack', java: absent },
    { entity: 'minecraft:blaze', component: 'minecraft:behavior.melee_box_attack', java: absent },
    {
        // Java `Ghast.registerGoals` adds `GhastShootFireballGoal`: a fireball every 60 ticks.
        entity: 'minecraft:ghast',
        component: 'minecraft:behavior.ranged_attack',
        java: ({ priority }) => ({
            [GHAST_SHOOT_FIREBALL]: {
                ...(priority === undefined ? {} : { priority }),
                projectile: 'minecraft:fireball'
            }
        })
    },
    {
        // Java `Shulker.registerGoals` adds `ShulkerAttackGoal`: a bullet every 20 to 110 ticks.
        entity: 'minecraft:shulker',
        component: 'minecraft:behavior.ranged_attack',
        java: ({ priority }) => ({
            [SHULKER_ATTACK]: {
                ...(priority === undefined ? {} : { priority }),
                projectile: 'minecraft:shulker_bullet'
            }
        })
    },
    {
        // Java `Phantom.registerGoals` targets through `PhantomAttackPlayerTargetGoal`: the highest
        // player in its box inflated by 16 across and 64 up and down, every 30 updates.
        entity: 'minecraft:phantom',
        component: 'minecraft:behavior.nearest_attackable_target',
        java: ({ priority }) => ({
            [PHANTOM_ATTACK_PLAYER_TARGET]: priority === undefined ? {} : { priority }
        })
    },
    {
        // Java's phantom flees nothing: `PhantomSweepAttackGoal.canContinueToUse` breaks a swoop
        // off while a cat is in its box inflated by 16, and `stop` drops the target. Ocelots do
        // not count.
        entity: 'minecraft:phantom',
        component: 'minecraft:behavior.avoid_mob_type',
        java: absent
    },
    {
        entity: 'minecraft:phantom',
        component: 'minecraft:behavior.swoop_attack',
        java: (body) => ({
            'minecraft:behavior.swoop_attack': {
                ...body,
                scared_of: { test: 'is_family', subject: 'other', value: 'cat' },
                scare_range: 16
            }
        })
    },
    {
        // Java `Fox$StalkPreyGoal` walks the fox at 1.5 toward prey farther than 6 blocks
        // (`distanceToSqr > 36`) and crouches inside them; `Fox.tick` fills `crouchAmount` by 0.2
        // a tick to 3, so `FoxPounceGoal` leaps 15 ticks later. `Fox.STALKABLE_PREY` is chickens
        // and rabbits; any other target is left to `FoxMeleeAttackGoal`.
        entity: 'minecraft:fox',
        component: 'minecraft:behavior.stalk_and_pounce_on_target',
        java: (body) => ({
            'minecraft:behavior.stalk_and_pounce_on_target': {
                ...body,
                stalk_speed: 1.5,
                pounce_max_dist: 6,
                interest_time: 15 / TICKS_PER_SECOND,
                filters: {
                    any_of: [
                        { test: 'is_family', subject: 'other', value: 'chicken' },
                        { test: 'is_family', subject: 'other', value: 'rabbit' }
                    ]
                }
            }
        })
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
        // Java `Blaze.registerGoals` adds `LookAtPlayerGoal(this, Player.class, 8.0F)` at 8.
        entity: 'minecraft:blaze',
        component: PHYSICS,
        java: beside(PHYSICS, {
            'minecraft:behavior.look_at_player': { priority: 8, look_distance: 8, probability: 0.02 }
        })
    },
    {
        // Java `Endermite.registerGoals` looks at players at 7, looks around at 8 and, with
        // `HurtByTargetGoal(this).setAlertOthers()`, turns on what hurt it and calls its kind.
        entity: 'minecraft:endermite',
        component: PHYSICS,
        java: beside(PHYSICS, {
            'minecraft:behavior.look_at_player': { priority: 7, look_distance: 8, probability: 0.02 },
            'minecraft:behavior.random_look_around': { priority: 8 },
            'minecraft:behavior.hurt_by_target': { priority: 1, alert_same_type: true }
        })
    },
    {
        // Java `Blaze.registerGoals` adds `MoveTowardsRestrictionGoal(this, 1.0)` at 5, which walks
        // a blaze that a fortress spawner placed back toward it.
        entity: 'minecraft:blaze',
        component: 'minecraft:behavior.random_look_around',
        java: beside('minecraft:behavior.random_look_around', {
            'minecraft:behavior.move_towards_home_restriction': { priority: 5, speed_multiplier: 1 }
        })
    },
    {
        // Java `AbstractHorse.registerGoals` adds `RunAroundLikeCrazyGoal(this, 1.2)` at 1, which
        // bucks an untamed rider off a skeleton horse too.
        entity: 'minecraft:skeleton_horse',
        component: PHYSICS,
        java: beside(PHYSICS, { 'minecraft:behavior.run_around_like_crazy': { priority: 1, speed_multiplier: 1.2 } })
    },
    {
        // Java `AbstractSkeleton.registerGoals` flees wolves with `AvoidEntityGoal(this, Wolf.class,
        // 6.0F, 1.0, 1.2)` and the sun with `FleeSunGoal(this, 1.0)`, both at 3, for a wither
        // skeleton too.
        entity: 'minecraft:wither_skeleton',
        component: PHYSICS,
        java: beside(PHYSICS, {
            'minecraft:behavior.avoid_mob_type': {
                priority: 3,
                entity_types: [
                    {
                        filters: { test: 'is_family', subject: 'other', value: 'wolf' },
                        max_dist: 6,
                        walk_speed_multiplier: 1,
                        sprint_speed_multiplier: 1.2
                    }
                ]
            },
            'minecraft:behavior.flee_sun': { priority: 3, speed_multiplier: 1 }
        })
    },
    {
        // Java `Wolf.registerGoals` adds `RandomLookAroundGoal` at 10.
        entity: 'minecraft:wolf',
        component: PHYSICS,
        java: beside(PHYSICS, { 'minecraft:behavior.random_look_around': { priority: 10 } })
    },
    { entity: 'minecraft:cod', component: PHYSICS, java: FISH_PANIC },
    { entity: 'minecraft:salmon', component: PHYSICS, java: FISH_PANIC },
    { entity: 'minecraft:pufferfish', component: PHYSICS, java: FISH_PANIC },
    { entity: 'minecraft:tropical_fish', component: PHYSICS, java: FISH_PANIC },
    {
        // Java `WitherBoss.registerGoals` adds `RangedAttackGoal(this, 1.0, 40, 20.0F)`: a skull from
        // the middle head every 40 ticks at a target within 20 blocks. The vanilla file leaves the
        // shot to Bedrock's engine and declares no shooter, so both come beside its attack movement.
        entity: 'minecraft:wither',
        component: WITHER_ATTACK_POS,
        java: beside(WITHER_ATTACK_POS, {
            'minecraft:behavior.ranged_attack': {
                priority: 2,
                speed_multiplier: 1,
                attack_interval_min: 40 / TICKS_PER_SECOND,
                attack_interval_max: 40 / TICKS_PER_SECOND,
                attack_radius: 20
            },
            'minecraft:shooter': { def: 'minecraft:wither_skull' }
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
    const ruled =
        own === undefined
            ? data
            : own.reduce((file, ruling) => withComponentReplaced(file, ruling.component, ruling.java), data);
    return identifier === WITHER_SKELETON ? withWeaponSwap(ruled, WITHER_SKELETON_BOW) : ruled;
};

/** The wither skeleton, whose file declares only the melee goal Java swaps for a bow goal. */
const WITHER_SKELETON = 'minecraft:wither_skeleton';

/**
 * Java `AbstractSkeleton.reassessWeaponGoal` for the wither skeleton: `RangedBowAttackGoal(this, 1.0,
 * 20, 15.0F)` with its attack interval set to `getAttackInterval`, 40 ticks, while it holds a bow,
 * and the melee goal otherwise. Its arrows are set alight by `WitherSkeleton.getArrow`, which the
 * shooter does not model.
 */
const WITHER_SKELETON_BOW: Readonly<Record<string, Record<string, unknown>>> = {
    'minecraft:behavior.ranged_attack': {
        priority: 4,
        speed_multiplier: 1,
        attack_interval_min: 40 / TICKS_PER_SECOND,
        attack_interval_max: 40 / TICKS_PER_SECOND,
        attack_radius: 15
    },
    'minecraft:shooter': { def: 'minecraft:arrow', sound: 'bow' }
};

const MELEE_GOAL = 'minecraft:behavior.melee_box_attack';
const SWORD_GROUP = 'jsprismarine:melee_weapon';
const BOW_GROUP = 'jsprismarine:bow_weapon';
const TO_SWORD = 'jsprismarine:melee_mode';
const TO_BOW = 'jsprismarine:ranged_mode';

/**
 * Moves a file's base melee goal into a group of its own beside a bow group, and swaps between them
 * by the weapon held, as the vanilla skeleton's file does: each group's sensor raises the event that
 * swaps to the other, so the active group is not added again every tick, which would start its goal
 * over. The melee group is the one the entity spawns with.
 */
const withWeaponSwap = (data: unknown, bow: Readonly<Record<string, Record<string, unknown>>>): unknown => {
    if (!isRecord(data) || !isRecord(data['minecraft:entity'])) return data;
    const entity = data['minecraft:entity'];
    const components = isRecord(entity.components) ? entity.components : {};
    const melee = components[MELEE_GOAL];
    if (!isRecord(melee)) return data;
    const { [MELEE_GOAL]: _melee, ...base } = components;
    const sensor = (event: string, holdsBow: boolean) => ({
        'minecraft:environment_sensor': {
            triggers: [{ event, filters: { test: 'has_ranged_weapon', value: holdsBow } }]
        }
    });
    const events = isRecord(entity.events) ? entity.events : {};
    const spawned = isRecord(events['minecraft:entity_spawned']) ? events['minecraft:entity_spawned'] : {};
    const spawnAdd = isRecord(spawned.add) ? spawned.add : {};
    const spawnGroups = Array.isArray(spawnAdd.component_groups) ? spawnAdd.component_groups : [];
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            components: base,
            component_groups: {
                ...(isRecord(entity.component_groups) ? entity.component_groups : {}),
                [SWORD_GROUP]: { [MELEE_GOAL]: melee, ...sensor(TO_BOW, true) },
                [BOW_GROUP]: { ...bow, ...sensor(TO_SWORD, false) }
            },
            events: {
                ...events,
                'minecraft:entity_spawned': {
                    ...spawned,
                    add: { ...spawnAdd, component_groups: [...spawnGroups, SWORD_GROUP] }
                },
                [TO_BOW]: { add: { component_groups: [BOW_GROUP] }, remove: { component_groups: [SWORD_GROUP] } },
                [TO_SWORD]: { add: { component_groups: [SWORD_GROUP] }, remove: { component_groups: [BOW_GROUP] } }
            }
        }
    };
};
