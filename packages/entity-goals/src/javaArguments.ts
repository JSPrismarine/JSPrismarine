import type { GoalBody } from './params';
import { isRecord } from './params';

/**
 * Java's goal arguments, written into the Bedrock goal bodies they correspond to.
 *
 * A Java mob passes its goals their numbers in `registerGoals`, such as
 * `new LookAtPlayerGoal(this, Player.class, 8.0F)`, and a Bedrock definition writes the same
 * decision as a goal body, such as `"look_distance": 6`. The Bedrock client runs no mob AI, so
 * these are server decisions, and ADR 0024 gives them to Java the way ADR 0001 gives Java the
 * server-decided stats. {@link javaGoalBody} rewrites one body with the arguments of the Java goal
 * it stands for and leaves every key Java has no counterpart for as the pack wrote it.
 *
 * The arguments come from `@jsprismarine/bedrock-data`'s `java_entity_goals`, which reads them
 * out of the pinned Java server jar. This package takes them as data, the way
 * `@jsprismarine/entities` takes Java's stats, so it does not depend on the captures.
 */

/** One argument a Java goal was constructed with, as the capture writes it. */
export type JavaGoalArgument =
    | number
    | string
    | null
    | { readonly class: string; readonly entities: readonly string[] }
    | { readonly field: string }
    | {
          readonly lambda: string | null;
          readonly itemTags?: readonly string[];
          readonly items?: readonly string[];
      }
    | { readonly array: readonly JavaGoalArgument[] }
    | { readonly call: string; readonly args: readonly JavaGoalArgument[] }
    | { readonly object: string };

/** One goal a Java mob registers, with its arguments. */
export interface JavaGoalEntry {
    /** The vanilla goal class it is, by simple name, such as `LookAtPlayerGoal`. */
    readonly goal: string;
    /** Every class from the one constructed down to `Goal`, by simple name, such as `Fox$FoxPanicGoal`. */
    readonly classes: readonly string[];
    /** Which selector it was added to: `goal` or `target`. */
    readonly selector: string;
    /** The priority it was added with, or null when that was not a constant. */
    readonly priority: number | null;
    /** Each named constructor parameter along the chain, with the value the vanilla class ends up with. */
    readonly params: Readonly<Record<string, JavaGoalArgument | undefined>>;
    /** The instance methods called on the goal after construction, such as `setAlertOthers`. */
    readonly calls: readonly { readonly name: string; readonly args: readonly JavaGoalArgument[] }[];
    /** On a goal that calls `setAlertOthers`, the entity types of the mob's class and its subclasses. */
    readonly selfEntities?: readonly string[];
}

/** Every Java mob's goals by Java entity type, which is the shape of `java_entity_goals`. */
export type JavaGoalSource = Readonly<Record<string, readonly JavaGoalEntry[]>>;

/** What the server resolves for a translation that the capture cannot. */
export interface JavaGoalContext {
    /** The mob's own Java entity type, which a `getClass()` in an ignore list names. */
    readonly self: string;
    /** Java's base value of one of the mob's attributes, such as `minecraft:follow_range`. */
    attribute(name: string): number | undefined;
    /**
     * A filter that accepts, as `other`, the entities of exactly the given Java entity types, or
     * undefined when none of them runs on this server.
     */
    entityFilter(javaEntities: readonly string[]): GoalBody | undefined;
    /** The Bedrock items a Java item predicate accepts, from the item tags and items its code reads. */
    items(predicate: { readonly itemTags?: readonly string[]; readonly items?: readonly string[] }): readonly string[];
}

/**
 * How far an owner may get before a following pet teleports to it, from Java's
 * `TamableAnimal.shouldTryTeleportToOwner`, which tests `distanceToSqr >= 144`.
 */
const TELEPORT_TO_OWNER_DISTANCE = 12;

/** The speed `PathfindToRaidGoal.tick` hands `PathNavigation.moveTo`, whatever the raider. */
const RAID_PATHFIND_SPEED = 1;

/** How far `TryFindWaterGoal.start` looks for water: the blocks one out on every side. */
const TRY_FIND_WATER_RANGE = 1;

const GOAL_PACKAGE = 'net/minecraft/world/entity/ai/goal/';

/** A number a Java goal was constructed with, or undefined when it was not a constant. */
const numberParam = (goal: JavaGoalEntry, name: string): number | undefined => {
    const value = goal.params[name];
    return typeof value === 'number' ? value : undefined;
};

/** The Java entity types a class literal argument names, or none for any other argument. */
const entitiesParam = (goal: JavaGoalEntry, name: string): readonly string[] => {
    const value = goal.params[name];
    return isRecord(value) && 'entities' in value ? value.entities : [];
};

/** Whether a Java goal is, or extends, one of the goal classes named by simple name. */
const isGoal = (goal: JavaGoalEntry, names: readonly string[]): boolean =>
    goal.classes.some((name) => names.includes(name));

/**
 * Whether a Java goal narrows what it picks beyond its class: it is a subclass of the mob's own,
 * which may refuse in its own `canUse`, or one of `predicates` is a check of the mob's own
 * rather than the vanilla default. A narrowed goal's Bedrock conditions stay, since they stand
 * for the Java check the capture cannot carry.
 */
const isNarrowed = (goal: JavaGoalEntry, ...predicates: readonly string[]): boolean =>
    goal.classes[0] !== goal.goal ||
    predicates.some((name) => {
        const value = goal.params[name];
        if (value === null || value === undefined || !isRecord(value)) return false;
        // EntitySelector's shared predicates, such as NO_CREATIVE_OR_SPECTATOR, only drop players out of play.
        if ('field' in value) return !value.field.startsWith('EntitySelector.');
        if ('lambda' in value) return !(value.lambda?.startsWith(GOAL_PACKAGE) ?? false);
        return true;
    });

/** Java's `Goal.reducedTickDelay`: a delay halved, rounding up, for a goal that ticks on selector runs only. */
const reducedTickDelay = (ticks: number): number => Math.ceil(ticks / 2);

/** A body with the given keys set, the undefined ones left as they were. */
const withKeys = (body: GoalBody, keys: Readonly<Record<string, unknown>>): GoalBody => {
    const next: GoalBody = { ...body };
    for (const [key, value] of Object.entries(keys)) if (value !== undefined) next[key] = value;
    return next;
};

/** A body without the given keys, so the goal's own Java default applies. */
const withoutKeys = (body: GoalBody, ...keys: readonly string[]): GoalBody =>
    Object.fromEntries(Object.entries(body).filter(([key]) => !keys.includes(key)));

/** The `entity_types` entries a body declares, which vanilla writes as one entry or as a list. */
const entityTypeEntries = (body: GoalBody): readonly GoalBody[] => {
    const value = body.entity_types;
    const members = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return members.filter(isRecord);
};

/** Both filters, when there are two; the one there is otherwise. */
const bothFilters = (left: unknown, right: GoalBody | undefined): unknown => {
    if (left === undefined) return right;
    if (right === undefined) return left;
    return { all_of: [left, right] };
};

/** Picks one Java goal among several that stand for the same Bedrock goal: the idlest, by priority. */
const idlest = (goals: readonly JavaGoalEntry[]): JavaGoalEntry | undefined =>
    goals.reduce<JavaGoalEntry | undefined>(
        (best, goal) => (best === undefined || (goal.priority ?? 0) > (best.priority ?? 0) ? goal : best),
        undefined
    );

/** Rewrites one body with the Java goals that stand for it, all of which match the translation's classes. */
type Translate = (body: GoalBody, goals: readonly JavaGoalEntry[], context: JavaGoalContext) => GoalBody;

/** One Bedrock goal and how Java's arguments reach its body. */
interface Translation {
    /** The Java goal classes, by simple name, that do what the Bedrock goal does. */
    readonly javaClasses: readonly string[];
    /** Narrows the matching Java goals, such as to a look goal that looks at players. */
    readonly select?: (goal: JavaGoalEntry) => boolean;
    /** Narrows the matching goals by what else matched, such as a stroll that only swims when nothing else does. */
    readonly among?: (matching: readonly JavaGoalEntry[]) => readonly JavaGoalEntry[];
    readonly translate: Translate;
}

/** A body whose speed multiplier is the one Java goal's `speedModifier`. */
const speedOf =
    (key = 'speedModifier'): Translate =>
    (body, goals) =>
        withKeys(body, { speed_multiplier: numberParam(goals[0] ?? EMPTY_GOAL, key) });

const EMPTY_GOAL: JavaGoalEntry = { goal: '', classes: [], selector: 'goal', priority: null, params: {}, calls: [] };

/** A wander goal: its speed and the interval its start draw takes. */
const wander: Translate = (body, goals) => {
    const goal = idlest(goals) ?? EMPTY_GOAL;
    return withKeys(body, {
        speed_multiplier: numberParam(goal, 'speedModifier'),
        interval: numberParam(goal, 'interval')
    });
};

/**
 * The targeting goals: Java's target classes bound what the goal may pick, a Java goal whose only
 * condition is its class targets that class whatever the pack's conditions say, and every target
 * is searched for within the mob's Java follow range.
 */
const nearestTarget: Translate = (body, goals, context) => {
    const followRange = context.attribute('minecraft:follow_range');
    const allowed = context.entityFilter([...new Set(goals.flatMap((goal) => entitiesParam(goal, 'targetType')))]);
    const entries: GoalBody[] = entityTypeEntries(body).map((entry) =>
        withKeys(entry, { filters: bothFilters(entry.filters, allowed), max_dist: followRange })
    );
    for (const goal of goals) {
        if (isNarrowed(goal, 'selector', 'subselector')) continue;
        const filters = context.entityFilter(entitiesParam(goal, 'targetType'));
        if (filters === undefined) continue;
        entries.push({ filters, max_dist: followRange ?? 16, must_see: goal.params.mustSee === 1 });
    }
    const interval = goals.map((goal) => numberParam(goal, 'randomInterval')).find((value) => value !== undefined);
    return withKeys(body, { entity_types: entries, within_radius: followRange, scan_interval: interval });
};

/** The revenge goal: it strikes back at every attacker but the classes Java's goal ignores. */
const revenge: Translate = (body, goals, context) => {
    const ignored = goals.flatMap((goal) => {
        const value = goal.params.ignoreDamageFromTheseTypes;
        if (!isRecord(value) || !('array' in value)) return [];
        return value.array.flatMap((item) => {
            if (isRecord(item) && 'entities' in item) return item.entities;
            // `this.getClass()` ignores the mob's own type, as a zombified piglin's goal does.
            if (isRecord(item) && 'call' in item && item.call === 'Object.getClass') return [context.self];
            return [];
        });
    });
    const filter = ignored.length === 0 ? undefined : context.entityFilter([...new Set(ignored)]);
    // `setAlertOthers` calls the mob's own kind onto the attacker: every mob of its class and its
    // subclasses, but the classes the call names.
    const alerting = goals.find((goal) => goal.calls.some((call) => call.name === 'setAlertOthers'));
    const skipped = (alerting?.calls ?? [])
        .filter((call) => call.name === 'setAlertOthers')
        .flatMap((call) => call.args)
        .flatMap((arg) => (isRecord(arg) && 'array' in arg ? arg.array : []))
        .flatMap((item) => (isRecord(item) && 'entities' in item ? item.entities : []));
    const kin = (alerting?.selfEntities ?? []).filter((entity) => !skipped.includes(entity));
    const rest = withKeys(withoutKeys(body, 'entity_types'), {
        alert_same_type: alerting === undefined ? undefined : true,
        alert_filters: kin.some((entity) => entity !== context.self) ? context.entityFilter(kin) : undefined
    });
    return filter === undefined ? rest : { ...rest, entity_types: [{ filters: { none_of: [filter] } }] };
};

/**
 * The avoid goal: one entry per Java goal, for the class it avoids, at its distance and speeds.
 * A goal with a predicate of the mob's own keeps the pack's conditions on top of its class.
 */
const avoid: Translate = (body, goals, context) => {
    const declared = entityTypeEntries(body)
        .map((entry) => entry.filters)
        .filter((filters) => filters !== undefined);
    const condition = declared.length === 0 ? undefined : { any_of: declared };
    const entries = goals.flatMap((goal): GoalBody[] => {
        const filters = context.entityFilter(entitiesParam(goal, 'avoidClass'));
        if (filters === undefined) return [];
        const narrowed = isNarrowed(goal, 'avoidPredicate', 'predicateOnAvoidEntity');
        return [
            withKeys(
                {},
                {
                    filters: narrowed && condition !== undefined ? { all_of: [filters, condition] } : filters,
                    max_dist: numberParam(goal, 'maxDist'),
                    walk_speed_multiplier: numberParam(goal, 'walkSpeedModifier'),
                    sprint_speed_multiplier: numberParam(goal, 'sprintSpeedModifier')
                }
            )
        ];
    });
    return entries.length === 0 ? body : { ...body, entity_types: entries };
};

/** The tempt goal: Java's items, its speed and stop distance, and the mob's Java tempt range. */
const tempt: Translate = (body, goals, context) => {
    const items = [
        ...new Set(
            goals.flatMap((goal) => {
                const value = goal.params.items;
                return isRecord(value) && 'lambda' in value ? context.items(value) : [];
            })
        )
    ];
    const [first] = goals;
    return withKeys(body, {
        items: items.length === 0 ? undefined : items,
        speed_multiplier: first === undefined ? undefined : numberParam(first, 'speedModifier'),
        stop_distance: first === undefined ? undefined : numberParam(first, 'stopDistance'),
        can_get_scared: first === undefined ? undefined : first.params.canScare === 1,
        within_radius: context.attribute('minecraft:tempt_range')
    });
};

/** The turtle's own swim in water, which travels without a start draw. */
const TURTLE_TRAVEL = 'Turtle$TurtleTravelGoal';

/** Every Bedrock goal whose body Java's arguments reach, by component name. */
const TRANSLATIONS: Readonly<Record<string, Translation>> = {
    'minecraft:behavior.look_at_player': {
        javaClasses: ['LookAtPlayerGoal'],
        select: (goal) =>
            entitiesParam(goal, 'lookAtType').includes('minecraft:player') &&
            !goal.classes.includes('LookAtTradingPlayerGoal'),
        // `LookAtPlayerGoal.start` holds every look for 40 + nextInt(40) ticks, the goal's default.
        translate: (body, goals) => {
            const [goal] = goals;
            if (goal === undefined) return body;
            const probability = numberParam(goal, 'probability');
            return withKeys(withoutKeys(body, 'look_time'), {
                look_distance: numberParam(goal, 'lookDistance'),
                probability: probability === undefined ? undefined : Math.min(1, probability)
            });
        }
    },
    // `FloatGoal.tick` jumps on a 0.8 chance, the goal's default.
    'minecraft:behavior.float': {
        javaClasses: ['FloatGoal'],
        translate: (body) => withoutKeys(body, 'chance_per_tick_to_float')
    },
    'minecraft:behavior.random_stroll': {
        javaClasses: ['RandomStrollGoal'],
        select: (goal) => !goal.classes.includes('RandomSwimmingGoal'),
        translate: wander
    },
    'minecraft:behavior.random_swim': {
        javaClasses: ['RandomSwimmingGoal', TURTLE_TRAVEL, 'RandomStrollGoal'],
        select: (goal) => goal.classes[0] !== 'Turtle$TurtleRandomStrollGoal',
        // A guardian's plain `RandomStrollGoal` swims, since its navigation is bound to water, so it
        // stands for the swim only when the mob registers no swim of its own.
        among: (matching) => {
            const swims = matching.filter((goal) => isGoal(goal, ['RandomSwimmingGoal', TURTLE_TRAVEL]));
            return swims.length > 0 ? swims : matching;
        },
        // `Turtle$TurtleTravelGoal.canUse` starts whenever the turtle is in water, with no draw.
        translate: (body, goals, context) =>
            goals.some((goal) => isGoal(goal, [TURTLE_TRAVEL]))
                ? withKeys(body, {
                      speed_multiplier: numberParam(goals[0] ?? EMPTY_GOAL, 'speedModifier'),
                      interval: 0
                  })
                : wander(body, goals, context)
    },
    // `RandomLookAroundGoal` and `SitWhenOrderedToGoal` take no arguments.
    'minecraft:behavior.random_look_around': { javaClasses: ['RandomLookAroundGoal'], translate: (body) => body },
    'minecraft:behavior.stay_while_sitting': { javaClasses: ['SitWhenOrderedToGoal'], translate: (body) => body },
    // No Java goal walks a mob to a mount: `Zombie.finalizeSpawn` seats a chicken jockey as it
    // spawns, and `LandOnOwnersShoulderGoal` puts a tamed parrot on its owner.
    'minecraft:behavior.find_mount': { javaClasses: [], translate: (body) => body },
    'minecraft:behavior.swim_wander': {
        javaClasses: ['RandomSwimmingGoal'],
        // The body's `interval` is a tenth of the one-in-n draw a swim starts on.
        translate: (body, goals) => {
            const goal = idlest(goals) ?? EMPTY_GOAL;
            const interval = numberParam(goal, 'interval');
            return withKeys(body, {
                interval: interval === undefined ? undefined : reducedTickDelay(interval) / 10,
                speed_multiplier: numberParam(goal, 'speedModifier')
            });
        }
    },
    'minecraft:behavior.nearest_attackable_target': {
        javaClasses: ['NearestAttackableTargetGoal'],
        translate: nearestTarget
    },
    'minecraft:behavior.hurt_by_target': { javaClasses: ['HurtByTargetGoal'], translate: revenge },
    'minecraft:behavior.avoid_mob_type': { javaClasses: ['AvoidEntityGoal'], translate: avoid },
    'minecraft:behavior.panic': {
        javaClasses: ['PanicGoal'],
        translate: (body, goals) => {
            const [goal] = goals;
            if (goal === undefined) return body;
            const causes = goal.params.panicCausingDamageTypes;
            // The default predicate is Java's `panic_causes` damage tag, which the goal's default holds.
            const defaultCauses =
                isRecord(causes) &&
                'lambda' in causes &&
                (causes.lambda?.startsWith(`${GOAL_PACKAGE}PanicGoal.`) ?? false);
            return withKeys(defaultCauses ? withoutKeys(body, 'damage_sources', 'ignore_mob_damage') : body, {
                speed_multiplier: numberParam(goal, 'speedModifier')
            });
        }
    },
    'minecraft:behavior.tempt': { javaClasses: ['TemptGoal'], translate: tempt },
    'minecraft:behavior.melee_box_attack': { javaClasses: ['MeleeAttackGoal'], translate: speedOf() },
    'minecraft:behavior.breed': { javaClasses: ['BreedGoal'], translate: speedOf() },
    'minecraft:behavior.follow_parent': { javaClasses: ['FollowParentGoal'], translate: speedOf() },
    'minecraft:behavior.flee_sun': {
        javaClasses: ['FleeSunGoal'],
        select: (goal) => goal.classes[0] === 'FleeSunGoal',
        translate: speedOf()
    },
    // The fox's `SeekShelterGoal` is a `FleeSunGoal` with its own conditions.
    'minecraft:behavior.find_cover': { javaClasses: ['Fox$SeekShelterGoal'], translate: speedOf() },
    'minecraft:behavior.run_around_like_crazy': { javaClasses: ['RunAroundLikeCrazyGoal'], translate: speedOf() },
    'minecraft:behavior.move_towards_home_restriction': {
        javaClasses: ['MoveTowardsRestrictionGoal'],
        translate: speedOf('moveSpeedModifier')
    },
    'minecraft:behavior.ranged_attack': {
        javaClasses: ['RangedAttackGoal', 'RangedBowAttackGoal', 'RangedCrossbowAttackGoal'],
        translate: (body, goals) => {
            const goal = goals[0] ?? EMPTY_GOAL;
            return withKeys(body, {
                speed_multiplier: numberParam(goal, 'speedModifier'),
                attack_radius: numberParam(goal, 'attackRadius')
            });
        }
    },
    'minecraft:behavior.follow_owner': {
        javaClasses: ['FollowOwnerGoal'],
        translate: (body, goals) => {
            const goal = goals[0] ?? EMPTY_GOAL;
            return withKeys(body, {
                speed_multiplier: numberParam(goal, 'speedModifier'),
                start_distance: numberParam(goal, 'startDistance'),
                stop_distance: numberParam(goal, 'stopDistance')
            });
        }
    },
    'minecraft:behavior.teleport_to_owner': {
        javaClasses: ['FollowOwnerGoal'],
        translate: (body) => ({
            ...body,
            filters: { test: 'owner_distance', subject: 'self', operator: '>=', value: TELEPORT_TO_OWNER_DISTANCE }
        })
    },
    'minecraft:behavior.leap_at_target': {
        javaClasses: ['LeapAtTargetGoal'],
        translate: (body, goals) => withKeys(body, { yd: numberParam(goals[0] ?? EMPTY_GOAL, 'yd') })
    },
    'minecraft:behavior.stomp_turtle_egg': {
        javaClasses: ['RemoveBlockGoal'],
        translate: (body, goals) => {
            const goal = goals[0] ?? EMPTY_GOAL;
            return withKeys(body, {
                speed_multiplier: numberParam(goal, 'speedModifier'),
                search_range: numberParam(goal, 'searchRange'),
                search_height: numberParam(goal, 'verticalSearchRange')
            });
        }
    },
    'minecraft:behavior.move_to_water': {
        javaClasses: ['TryFindWaterGoal', 'TryFindLiquidGoal', 'Turtle$TurtleGoToWaterGoal'],
        translate: (body, goals) => {
            const goal = goals[0] ?? EMPTY_GOAL;
            return withKeys(body, {
                search_range: numberParam(goal, 'searchRange') ?? TRY_FIND_WATER_RANGE,
                search_height: numberParam(goal, 'verticalSearchRange'),
                speed_multiplier: numberParam(goal, 'speedModifier') ?? 1
            });
        }
    },
    'minecraft:behavior.move_to_village': {
        javaClasses: ['PathfindToRaidGoal'],
        translate: (body) => ({ ...body, speed_multiplier: RAID_PATHFIND_SPEED })
    },
    'minecraft:behavior.use_kinetic_weapon': {
        javaClasses: ['SpearUseGoal'],
        translate: (body, goals) => {
            const goal = goals[0] ?? EMPTY_GOAL;
            return withKeys(body, {
                speed_multiplier: numberParam(goal, 'speedModifierWhenCharging'),
                reposition_speed_multiplier: numberParam(goal, 'speedModifierWhenRepositioning'),
                approach_distance: numberParam(goal, 'approachDistance')
            });
        }
    }
};

/** Every Bedrock goal component whose body {@link javaGoalBody} can rewrite. */
export const JAVA_TRANSLATED_GOALS: readonly string[] = Object.keys(TRANSLATIONS).sort();

/**
 * The Java goals that stand for one Bedrock goal.
 *
 * @param component - The goal component, such as `minecraft:behavior.float`.
 * @param goals - Every goal the mob's Java class registers.
 * @returns The matching goals, empty when the Java class registers none of them, or undefined when
 *   {@link javaGoalBody} does not translate the component.
 */
export const matchingJavaGoals = (
    component: string,
    goals: readonly JavaGoalEntry[]
): readonly JavaGoalEntry[] | undefined => {
    const translation = TRANSLATIONS[component];
    if (translation === undefined) return undefined;
    const matching = goals.filter(
        (goal) => isGoal(goal, translation.javaClasses) && (translation.select?.(goal) ?? true)
    );
    return translation.among?.(matching) ?? matching;
};

/**
 * One Bedrock goal body with the arguments of the Java goals it stands for.
 *
 * @param component - The goal component, such as `minecraft:behavior.look_at_player`.
 * @param body - The body the pack declares.
 * @param goals - Every goal the mob's Java class registers.
 * @param context - What the server resolves: attributes, entity filters and items.
 * @returns The same body when no Java goal stands for it; otherwise a rewritten copy.
 */
export const javaGoalBody = (
    component: string,
    body: GoalBody,
    goals: readonly JavaGoalEntry[],
    context: JavaGoalContext
): GoalBody => {
    const translation = TRANSLATIONS[component];
    const matching = matchingJavaGoals(component, goals);
    return translation === undefined || matching === undefined || matching.length === 0
        ? body
        : translation.translate(body, matching, context);
};
