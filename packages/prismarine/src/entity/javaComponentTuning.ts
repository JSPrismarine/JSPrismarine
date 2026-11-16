/**
 * Java's countdowns, conversion delays and sensing distances, written over the vanilla entity
 * files as they load.
 *
 * Bedrock's pack stands a `minecraft:timer`, a `minecraft:transformation` delay or a sensor's range
 * in for a constant of Java's mob class, and some of those numbers have drifted from Java's: a
 * skeleton freezes into a stray after 20 seconds in powder snow where Java's takes 7 and then 15
 * more, an angry bee calms after 5 seconds where Java's stays angry 20 to 39, and a blaze switches
 * to melee a block early. How long a mob waits and how far it looks are the server's alone, so
 * Java's numbers decide. Each entry names the Java constant it carries. A component the pack gives
 * a mob for a rule its Java class does not have, such as the frog's own spawn egg hatching a
 * tadpole, is removed.
 */
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentRewritten, withoutComponent } from './definitionOverlay';

/** Ticks per second, which the pack writes its times in. */
const TICKS_PER_SECOND = 20;

/** A duration in Java ticks as the seconds a pack writes. */
const seconds = (ticks: number): number => ticks / TICKS_PER_SECOND;

/**
 * The largest distance under `distance`. A target sensor counts a target at or under its range as
 * inside, so this is the range at which it acts on Java's strict `distanceToSqr < distance²`.
 */
const under = (distance: number): number => distance - distance * Number.EPSILON;

/** One component of one entity, rewritten to Java's numbers. */
interface Tuning {
    readonly component: string;
    /** The component group whose body is rewritten, or undefined for every body. */
    readonly group: string | undefined;
    readonly rewrite: (body: Record<string, unknown>) => Record<string, unknown>;
}

/** A `minecraft:timer` that runs from `min` to `max` Java ticks, drawn evenly. */
const timerTicks = (group: string | undefined, min: number, max = min): Tuning => ({
    component: 'minecraft:timer',
    group,
    rewrite: ({ random_time_choices: _choices, ...timer }) => ({
        ...timer,
        time: min === max ? seconds(min) : [seconds(min), seconds(max)],
        randomInterval: min !== max
    })
});

/** A `minecraft:transformation` that converts after `ticks` Java ticks. */
const transformationTicks = (group: string, ticks: number): Tuning => ({
    component: 'minecraft:transformation',
    group,
    rewrite: (transformation) => ({ ...transformation, delay: seconds(ticks) })
});

/** Every subsensor of a `minecraft:entity_sensor` searching `horizontal` by `vertical` blocks. */
const sensorBox = (group: string | undefined, horizontal: number, vertical: number, yOffset?: number): Tuning => ({
    component: 'minecraft:entity_sensor',
    group,
    rewrite: (sensor) => ({
        ...sensor,
        subsensors: (Array.isArray(sensor.subsensors) ? sensor.subsensors : []).map((subsensor: unknown) =>
            isRecord(subsensor)
                ? {
                      ...subsensor,
                      range: [horizontal, vertical],
                      ...(yOffset === undefined ? {} : { y_offset: yOffset })
                  }
                : subsensor
        )
    })
});

/** A `minecraft:spell_effects` whose added effects last `ticks` Java ticks. */
const spellEffectTicks = (group: string, ticks: number): Tuning => ({
    component: 'minecraft:spell_effects',
    group,
    rewrite: (spell) => ({
        ...spell,
        add_effects: (Array.isArray(spell.add_effects) ? spell.add_effects : []).map((effect: unknown) =>
            isRecord(effect) ? { ...effect, duration: seconds(ticks) } : effect
        )
    })
});

/**
 * A `minecraft:home` that keeps the home position but holds no movement to it, for a mob whose
 * Java class never calls `Mob.setHomeTo`. Bedrock's default `restriction_type` is `none`.
 */
const unrestrictedHome: Tuning = {
    component: 'minecraft:home',
    group: undefined,
    rewrite: ({ restriction_radius: _radius, restriction_type: _type, ...home }) => home
};

/** Java's numbers for each vanilla mob whose pack numbers differ, by Java entity type. */
const JAVA_TUNINGS: Readonly<Record<string, readonly Tuning[]>> = {
    'minecraft:skeleton': [
        // `Skeleton.tick`: 140 ticks in powder snow start the freezing conversion, which takes 300.
        timerTicks('in_powder_snow', 140),
        transformationTicks('become_stray', 300)
    ],
    // `Pig.thunderHit` and `Villager.thunderHit` convert in the tick the lightning strikes.
    'minecraft:pig': [transformationTicks('minecraft:pig_transform', 0)],
    'minecraft:villager': [transformationTicks('become_witch', 0)],
    // `WanderingTraderSpawner.spawn` calls `setDespawnDelay(48000)`.
    'minecraft:wandering_trader': [timerTicks(undefined, 48000)],
    'minecraft:bee': [
        // `EyeblossomBlock.getBeeInteractionEffect` and `WitherRoseBlock.getBeeInteractionEffect`:
        // Poison for 25 ticks and Wither for 40, where the pack writes 25 and 40 seconds.
        spellEffectTicks('add_poison_effect', 25),
        spellEffectTicks('add_wither_effect', 40),
        // `BeehiveBlockEntity.MIN_TICKS_BEFORE_REENTERING_HIVE` for a bee a burning hive lets out.
        timerTicks('escape_fire', 400),
        // `Bee.STING_DEATH_COUNTDOWN`: a stung bee dies from its fifth tick to its 1200th.
        timerTicks('countdown_to_perish', 5, 1200),
        // `Bee.PERSISTENT_ANGER_TIME`, 20 to 39 seconds.
        timerTicks('take_nearest_target', 400, 780),
        // `Bee$BeeGoToHiveGoal.MAX_TRAVELLING_TICKS`.
        timerTicks('find_hive', 2400),
        // `Bee.COOLDOWN_BEFORE_LOCATING_NEW_HIVE`.
        timerTicks('hive_full', 200),
        // `BeehiveBlock.angerNearbyBees` angers the bees in the hive's box inflated by 8.
        {
            component: 'minecraft:block_sensor',
            group: undefined,
            rewrite: (sensor) => ({ ...sensor, sensor_radius: 8 })
        }
    ],
    // `Guardian$GuardianAttackGoal` stops within 3 blocks and the goal selector starts it again on
    // its next update, at most two ticks later.
    // Only the elder guardian sets a home (`ElderGuardian.customServerAiStep`, 16 blocks); a
    // guardian's `MoveTowardsRestrictionGoal` has none to move toward.
    'minecraft:guardian': [timerTicks('minecraft:guardian_passive', 0, 2), unrestrictedHome],
    // `Creaking.setTransient` records its heart but sets no home radius;
    // `CreakingHeartBlockEntity.CREAKING_ROAMING_RADIUS` only scales the heart's comparator signal.
    'minecraft:creaking': [unrestrictedHome],
    // `Salmon.getMaxSchoolSize`; a cod's and a tropical fish's school is `AbstractFish`'s 8.
    'minecraft:salmon': [
        {
            component: 'minecraft:flocking',
            group: undefined,
            rewrite: (flocking) => ({ ...flocking, high_flock_limit: 5 })
        }
    ],
    // `Blaze$BlazeAttackGoal.tick` bites below `distanceToSqr` 4 and throws fireballs from there on.
    'minecraft:blaze': [
        {
            component: 'minecraft:target_nearby_sensor',
            group: undefined,
            rewrite: (sensor) => ({ ...sensor, inside_range: under(2), outside_range: under(2) })
        }
    ],
    // A trident drowned's `DrownedTridentAttackGoal` holds the priority it shares with
    // `DrownedAttackGoal` once it starts, so the drowned throws at any range and never bites.
    'minecraft:drowned': [
        {
            component: 'minecraft:target_nearby_sensor',
            group: undefined,
            rewrite: ({ on_inside_range: _melee, ...sensor }) => sensor
        }
    ],
    // `Pufferfish$PufferfishPuffGoal` puffs up at a threat within its box inflated by 2.
    'minecraft:pufferfish': [sensorBox(undefined, 2, 2)],
    // `HappyGhast.scanPlayerAboveGhast` looks for a player in the box one block past each side of
    // the 4 block ghast and from its top to half its height above: 3 across, 4 to 6 blocks up.
    'minecraft:happy_ghast': [sensorBox('minecraft:adult', 3, 1, 5)]
};

/**
 * The components Bedrock's pack gives a mob for a rule its Java class does not have, by Java
 * entity type. `Frog.getBreedOffspring` returns null, so `SpawnEggItem.spawnOffspringFromSpawnEgg`
 * makes nothing when a frog egg is used on a frog, where Bedrock's frog hatches a tadpole.
 */
const JAVA_ABSENT: Readonly<Record<string, readonly string[]>> = {
    'minecraft:frog': ['minecraft:spawn_egg_interaction'],
    // Only `AbstractSchoolingFish` schools, which neither `Pufferfish` nor `Dolphin` extends.
    'minecraft:pufferfish': ['minecraft:flocking'],
    'minecraft:dolphin': ['minecraft:flocking']
};

/** A table keyed by Java entity type, keyed by Bedrock identifier instead. */
const byBedrock = <T>(table: Readonly<Record<string, T>>): ReadonlyMap<string, T> => {
    const rows = new Map<string, T>();
    for (const [javaEntity, row] of Object.entries(table)) {
        const entity = javaEntityTypeToBedrock(javaEntity);
        if (entity.kind === 'mapped') rows.set(entity.bedrock, row);
    }
    return rows;
};

let tuningsByBedrock: ReadonlyMap<string, readonly Tuning[]> | undefined;
let absentByBedrock: ReadonlyMap<string, readonly string[]> | undefined;

/**
 * Applies Java's countdowns, conversion delays and sensing distances to one entity file in the
 * shape a behavior pack writes, and removes the components for rules Java's class lacks.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for a file Java tunes nothing of; otherwise a copy with each tuned
 *   component rewritten and each absent one removed.
 */
export const withJavaComponentTuning = (data: unknown): unknown => {
    tuningsByBedrock ??= byBedrock(JAVA_TUNINGS);
    absentByBedrock ??= byBedrock(JAVA_ABSENT);
    const identifier = entityFileIdentifier(data);
    if (identifier === undefined) return data;
    const tuned = (tuningsByBedrock.get(identifier) ?? []).reduce(
        (file, tuning) =>
            withComponentRewritten(file, tuning.component, (body, group) =>
                tuning.group === undefined || tuning.group === group ? tuning.rewrite(body) : body
            ),
        data
    );
    return (absentByBedrock.get(identifier) ?? []).reduce(withoutComponent, tuned);
};
