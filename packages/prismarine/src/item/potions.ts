/**
 * Java's potions, which `Potions` keeps in code rather than in a data pack: the effects each one
 * carries, as `Potions.<clinit>` registers them in the 26.3 server jar. The parity suite reads the
 * same registrations out of the pinned jar and fails when one drifts.
 */
import type { EffectApplication } from '@jsprismarine/item-behaviors/world';

import type { PotionEffects } from './contentAdapter';

/** One effect of a potion: the effect, its ticks and its amplifier. */
type PotionEffect = readonly [effect: string, ticks: number, amplifier?: number];

/** A potion that lasts `base` ticks, with its `long_` form at `long` and its `strong_` form at `strong` with amplifier 1. */
const variants = (
    name: string,
    effect: string,
    base: number,
    long?: number,
    strong?: number
): (readonly [string, readonly PotionEffect[]])[] => [
    [name, [[effect, base]]],
    ...(long === undefined ? [] : [[`long_${name}`, [[effect, long]]] as const]),
    ...(strong === undefined ? [] : [[`strong_${name}`, [[effect, strong, 1]]] as const])
];

/** Every potion with effects, by its name without the namespace; water, mundane, thick and awkward have none. */
const POTIONS: ReadonlyMap<string, readonly PotionEffect[]> = new Map([
    ...variants('night_vision', 'night_vision', 3600, 9600),
    ...variants('invisibility', 'invisibility', 3600, 9600),
    ...variants('leaping', 'jump_boost', 3600, 9600, 1800),
    ...variants('fire_resistance', 'fire_resistance', 3600, 9600),
    ...variants('swiftness', 'speed', 3600, 9600, 1800),
    ['slowness', [['slowness', 1800]]],
    ['long_slowness', [['slowness', 4800]]],
    ['strong_slowness', [['slowness', 400, 3]]],
    [
        'turtle_master',
        [
            ['slowness', 400, 3],
            ['resistance', 400, 2]
        ]
    ],
    [
        'long_turtle_master',
        [
            ['slowness', 800, 3],
            ['resistance', 800, 2]
        ]
    ],
    [
        'strong_turtle_master',
        [
            ['slowness', 400, 5],
            ['resistance', 400, 3]
        ]
    ],
    ...variants('water_breathing', 'water_breathing', 3600, 9600),
    ['healing', [['instant_health', 1]]],
    ['strong_healing', [['instant_health', 1, 1]]],
    ['harming', [['instant_damage', 1]]],
    ['strong_harming', [['instant_damage', 1, 1]]],
    ...variants('poison', 'poison', 900, 1800),
    ['strong_poison', [['poison', 432, 1]]],
    ...variants('regeneration', 'regeneration', 900, 1800),
    ['strong_regeneration', [['regeneration', 450, 1]]],
    ...variants('strength', 'strength', 3600, 9600, 1800),
    ...variants('weakness', 'weakness', 1800, 4800),
    ...variants('luck', 'luck', 6000),
    ...variants('slow_falling', 'slow_falling', 1800, 4800),
    ...variants('wind_charged', 'wind_charged', 3600),
    ...variants('weaving', 'weaving', 3600),
    ...variants('oozing', 'oozing', 3600),
    ...variants('infested', 'infested', 3600)
]);

/** The namespace every vanilla potion and effect is in. */
const NAMESPACE = 'minecraft:';

/**
 * The effects one potion applies, by its identifier, such as `minecraft:long_poison`; none for a
 * potion with no effects or one Java does not register.
 */
export const javaPotionEffects: PotionEffects = (potion): readonly EffectApplication[] =>
    (POTIONS.get(potion.startsWith(NAMESPACE) ? potion.slice(NAMESPACE.length) : potion) ?? []).map(
        ([effect, ticks, amplifier]) => ({
            id: `${NAMESPACE}${effect}`,
            durationTicks: ticks,
            amplifier: amplifier ?? 0,
            showIcon: true
        })
    );
