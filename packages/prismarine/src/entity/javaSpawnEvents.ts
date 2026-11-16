/**
 * Java's spawn rolls, written into the vanilla entity files' spawn events as they load.
 *
 * What a mob is when it spawns, its coat, its colors and the jockey it carries, is the server's to
 * decide: the client draws whatever variant it is sent. Where a vanilla spawn event rolls another
 * table than Java's `finalizeSpawn`, the event is rewritten to roll Java's, through the component
 * groups the file already has, the way a Java goal parameter replaces a Bedrock one in
 * `javaGoals.ts`. A ruling may also take off a group Java has no counterpart for, such as the
 * stray a Bedrock spider can carry, or add one Java needs, such as a black tropical fish.
 */
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier } from './definitionOverlay';

/** One node of an event: `add`, `remove`, `trigger`, `filters`, and nested `sequence`, `randomize` or `first_valid`. */
type EventNode = Readonly<Record<string, unknown>>;

/** A rewritten event: a fixed body, a rewrite of the declared one, or null to take the event off. */
type EventRuling = EventNode | null | ((declared: Record<string, unknown>) => EventNode);

/** One Java ruling over a vanilla entity's spawn events and the component groups they add. */
interface JavaSpawnRuling {
    /** The Java entity type, which `@jsprismarine/mapping` turns into the Bedrock one. */
    readonly entity: string;
    /** The events the ruling rewrites. A fixed body or null applies only to an event the file declares. */
    readonly events: Readonly<Record<string, EventRuling>>;
    /** Component groups to set, or null to take off. */
    readonly groups?: Readonly<Record<string, Record<string, unknown> | null>>;
    /** Events the file does not declare, which the ruling's other events trigger. */
    readonly added?: Readonly<Record<string, EventNode>>;
}

/** A node that adds component groups. */
const add = (...groups: readonly string[]): EventNode => ({ add: { component_groups: groups } });

/** A branch of a `randomize`. */
const weighted = (weight: number, node: EventNode): EventNode => ({ weight, ...node });

/** Whether a node adds `group` itself or through one of its `randomize` branches. */
const addsGroup = (node: unknown, group: string): boolean => {
    if (!isRecord(node)) return false;
    const added = isRecord(node.add) ? node.add.component_groups : undefined;
    if (Array.isArray(added) && added.includes(group)) return true;
    return Array.isArray(node.randomize) && node.randomize.some((branch) => addsGroup(branch, group));
};

/**
 * Rewrites the nodes of an event. `rewrite` answers a node with its replacement, null to drop it,
 * or undefined to keep it and look inside its `sequence`, `randomize` and `first_valid`.
 */
const mapNodes = (
    node: Record<string, unknown>,
    rewrite: (node: Record<string, unknown>) => EventNode | null | undefined
) => {
    const children = (list: unknown): unknown =>
        Array.isArray(list)
            ? list.flatMap((child) => {
                  if (!isRecord(child)) return [child];
                  const replaced = rewrite(child);
                  if (replaced === null) return [];
                  return [replaced ?? mapNodes(child, rewrite)];
              })
            : list;
    return {
        ...node,
        ...('sequence' in node ? { sequence: children(node.sequence) } : {}),
        ...('randomize' in node ? { randomize: children(node.randomize) } : {}),
        ...('first_valid' in node ? { first_valid: children(node.first_valid) } : {})
    };
};

/** The groups that seat a skeleton of some kind on a spider. */
const SPIDER_BIOME_JOCKEYS = [
    'minecraft:spider_stray_jockey',
    'minecraft:spider_bogged_jockey',
    'minecraft:spider_parched_jockey',
    'minecraft:spider_wither_jockey'
] as const;

/**
 * Java `Rabbit.getRandomRabbitVariant`: `nextInt(100)` in a biome tagged `spawns_white_rabbits`
 * gives white below 80 and white splotched otherwise, `spawns_gold_rabbits` gives gold, and
 * anywhere else brown below 50, salt and pepper below 90, and black otherwise. Bedrock's tags carry
 * Java's names, and the coats are Bedrock's groups.
 */
const JAVA_RABBIT_COAT: EventNode = {
    filters: { test: 'has_component', operator: '!=', value: 'minecraft:variant' },
    first_valid: [
        {
            filters: { test: 'has_biome_tag', value: 'spawns_white_rabbits' },
            randomize: [weighted(80, add('coat_white')), weighted(20, add('coat_splotched'))]
        },
        { filters: { test: 'has_biome_tag', value: 'spawns_gold_rabbits' }, ...add('coat_desert') },
        {
            randomize: [
                weighted(50, add('coat_brown')),
                weighted(40, add('coat_salt')),
                weighted(10, add('coat_black'))
            ]
        }
    ]
};

/** Replaces Bedrock's coat rolls, which put black and salt and pepper the other way round and read snow cover. */
const javaRabbitCoat = (declared: Record<string, unknown>): EventNode =>
    mapNodes(declared, (node) => {
        if (addsGroup(node, 'coat_brown')) return JAVA_RABBIT_COAT;
        if (addsGroup(node, 'coat_desert') || addsGroup(node, 'coat_white')) return null;
        return undefined;
    });

/**
 * Java's 22 common tropical fish, `TropicalFish.COMMON_VARIANTS` in order, which is also the order
 * of their `entity.minecraft.tropical_fish.predefined` names. Bedrock writes the same 22 as named
 * groups, four of them with another pattern or color. Each is the Bedrock group and Java's
 * pattern and two dye colors as Bedrock's numbers: the pattern's base (0 small, 1 large) is
 * `minecraft:variant`, its index within the base `minecraft:mark_variant`, and a dye color's
 * `DyeColor` ordinal `minecraft:color` and `minecraft:color2`.
 */
const JAVA_TROPICAL_FISH: readonly (readonly [
    group: string,
    base: number,
    pattern: number,
    color: number,
    color2: number
])[] = [
    ['anenonme', 1, 1, 1, 7], // stripey, orange, gray
    ['black_tang', 1, 0, 7, 7], // flopper, gray, gray
    ['blue_dory', 1, 0, 7, 11], // flopper, gray, blue
    ['butterfly_fish', 1, 5, 0, 7], // clayfish, white, gray
    ['cichlid', 0, 1, 11, 7], // sunstreak, blue, gray
    ['clownfish', 0, 0, 1, 0], // kob, orange, white
    ['cc_betta', 0, 5, 6, 3], // spotty, pink, light blue
    ['dog_fish', 1, 3, 10, 4], // blockfish, purple, yellow
    ['e_red_snapper', 1, 5, 0, 14], // clayfish, white, red
    ['goat_fish', 0, 5, 0, 4], // spotty, white, yellow
    ['moorish_idol', 1, 2, 0, 7], // glitter, white, gray
    ['ornate_butterfly', 1, 5, 0, 1], // clayfish, white, orange
    ['parrot_fish', 0, 3, 9, 6], // dasher, cyan, pink
    ['queen_angel_fish', 0, 4, 5, 3], // brinely, lime, light blue
    ['red_cichlid', 1, 4, 14, 0], // betty, red, white
    ['red_lipped_benny', 0, 2, 7, 14], // snooper, gray, red
    ['red_snapper', 1, 3, 14, 0], // blockfish, red, white
    ['threadfin', 1, 0, 0, 4], // flopper, white, yellow
    ['tomato_clown', 0, 0, 14, 0], // kob, red, white
    ['triggerfish', 0, 1, 7, 0], // sunstreak, gray, white
    ['yellow_tail_parrot', 0, 3, 9, 4], // dasher, cyan, yellow
    ['yellow_tang', 1, 0, 4, 4] // flopper, yellow, yellow
];

/** Java's `DyeColor.BLACK`, which Bedrock's random tropical fish never take. */
const BLACK = 15;

/**
 * Java `TropicalFish.finalizeSpawn`: `nextFloat() < 0.9` picks one of the common variants, and
 * otherwise a random pattern and two random dye colors of all sixteen. Bedrock's spawn event only
 * ever draws the random fish, from fifteen colors. The random draw keeps Bedrock's groups, with a
 * black one added to each color.
 */
const javaTropicalFish = (declared: Record<string, unknown>): EventNode => {
    const steps: readonly unknown[] = Array.isArray(declared.sequence) ? declared.sequence : [];
    const black = (step: Record<string, unknown>): readonly EventNode[] =>
        addsGroup(step, 'minecraft:tropicalfish_base_white')
            ? [weighted(1, add('minecraft:tropicalfish_base_black'))]
            : addsGroup(step, 'minecraft:tropicalfish_pattern_white')
              ? [weighted(1, add('minecraft:tropicalfish_pattern_black'))]
              : [];
    const random = steps.flatMap((step) =>
        isRecord(step) && Array.isArray(step.randomize)
            ? [{ ...step, randomize: [...step.randomize, ...black(step)] }]
            : []
    );
    const common = JAVA_TROPICAL_FISH.map(([group]) => weighted(1, { trigger: `minecraft:become_${group}` }));
    return {
        ...declared,
        sequence: [
            ...steps.filter((step) => !(isRecord(step) && Array.isArray(step.randomize))),
            { randomize: [weighted(9, { randomize: common }), weighted(1, { sequence: random })] }
        ]
    };
};

/** Every ruling, each with the Java source that decides it. */
const JAVA_SPAWN_RULINGS: readonly JavaSpawnRuling[] = [
    {
        // Java `Spider.finalizeSpawn` seats a skeleton on `random.nextInt(100) == 0`, whatever the
        // time and the biome. Bedrock waits for night or a cave, and swaps in a stray, bogged,
        // parched or wither skeleton by biome.
        entity: 'minecraft:spider',
        events: {
            'minecraft:entity_spawned': {
                randomize: [
                    weighted(1, { trigger: 'minecraft:entity_spawned_with_default_jockey' }),
                    weighted(99, add('minecraft:spider_neutral'))
                ]
            },
            'minecraft:entity_spawned_with_default_jockey': add('minecraft:spider_jockey', 'minecraft:spider_neutral'),
            'minecraft:entity_spawned_with_biome_specific_jockey': null
        },
        groups: Object.fromEntries(SPIDER_BIOME_JOCKEYS.map((group) => [group, null]))
    },
    {
        // Java `CaveSpider.finalizeSpawn` returns the group data without running the spider's
        // roll, so a cave spider never spawns with a rider.
        entity: 'minecraft:cave_spider',
        events: {
            'minecraft:entity_spawned': add('minecraft:spider_neutral'),
            'minecraft:entity_spawned_with_default_jockey': null,
            'minecraft:entity_spawned_with_biome_specific_jockey': null
        },
        groups: Object.fromEntries(['minecraft:spider_jockey', ...SPIDER_BIOME_JOCKEYS].map((group) => [group, null]))
    },
    {
        // Java `Strider.finalizeSpawn`: an adult takes a zombified piglin jockey on
        // `nextInt(30) == 0` and otherwise a baby strider jockey on `nextInt(10) == 0`. Of 300
        // adults that is 10 and 29. Babies keep Bedrock's half of the spawns.
        entity: 'minecraft:strider',
        events: {
            'minecraft:entity_spawned': {
                randomize: [
                    weighted(261, { trigger: 'spawn_adult' }),
                    weighted(10, { trigger: 'spawn_adult_piglin_jockey' }),
                    weighted(29, { trigger: 'spawn_adult_parent_jockey' }),
                    weighted(300, { trigger: 'spawn_baby' })
                ]
            }
        }
    },
    {
        entity: 'minecraft:rabbit',
        events: { 'minecraft:entity_spawned': javaRabbitCoat, 'minecraft:entity_born': javaRabbitCoat }
    },
    {
        // Java `Fox.Variant.byBiome`: a snow fox in a biome tagged `spawns_snow_foxes`, where
        // Bedrock reads whether the ground is snow covered.
        entity: 'minecraft:fox',
        events: {
            'minecraft:entity_spawned': (declared) =>
                mapNodes(declared, (node) => {
                    if (addsGroup(node, 'minecraft:fox_arctic'))
                        return {
                            filters: { test: 'has_biome_tag', value: 'spawns_snow_foxes' },
                            ...add('minecraft:fox_arctic')
                        };
                    if (addsGroup(node, 'minecraft:fox_red'))
                        return {
                            filters: { test: 'has_biome_tag', operator: '!=', value: 'spawns_snow_foxes' },
                            ...add('minecraft:fox_red')
                        };
                    return undefined;
                })
        }
    },
    {
        // Java `Villager.finalizeSpawn` leaves a spawned villager without a profession until it
        // claims a workstation. Bedrock's spawn event deals out one of the fourteen.
        entity: 'minecraft:villager',
        events: {
            'minecraft:entity_spawned': (declared) =>
                mapNodes(declared, (node) =>
                    addsGroup(node, 'farmer') ? add('unskilled', 'behavior_peasant', 'basic_schedule') : undefined
                )
        }
    },
    {
        entity: 'minecraft:tropical_fish',
        events: { 'minecraft:entity_spawned': javaTropicalFish },
        groups: {
            ...Object.fromEntries(
                JAVA_TROPICAL_FISH.map(([group, base, pattern, color, color2]) => [
                    `minecraft:${group}`,
                    {
                        'minecraft:color': { value: color },
                        'minecraft:color2': { value: color2 },
                        'minecraft:mark_variant': { value: pattern },
                        'minecraft:variant': { value: base }
                    }
                ])
            ),
            'minecraft:tropicalfish_base_black': { 'minecraft:color': { value: BLACK } },
            'minecraft:tropicalfish_pattern_black': { 'minecraft:color2': { value: BLACK } }
        }
    },
    {
        // Java `AgeableMob.finalizeSpawn` makes a baby only of a spawn group's later members, on
        // `nextFloat() <= 0.05`, and `SulfurCube.setSpawnSize` sizes a baby 1 and anything else 2.
        // A cube spawned on its own is always the grown size; the spawn rule's herd runs
        // Bedrock's five-in-a-hundred small roll for the members after the first.
        entity: 'minecraft:sulfur_cube',
        events: { 'minecraft:entity_spawned': { trigger: 'minecraft:spawn_medium' } },
        added: {
            'jsprismarine:spawn_group_member': {
                randomize: [
                    weighted(5, { trigger: 'minecraft:spawn_small' }),
                    weighted(95, { trigger: 'minecraft:spawn_medium' })
                ]
            }
        }
    }
];

/** The rulings for each Bedrock entity, by Bedrock identifier. */
export type JavaSpawnRulings = ReadonlyMap<string, JavaSpawnRuling>;

/** Resolves {@link JAVA_SPAWN_RULINGS} to the Bedrock entities they apply to. */
export const javaSpawnRulings = (): JavaSpawnRulings => {
    const rulings = new Map<string, JavaSpawnRuling>();
    for (const ruling of JAVA_SPAWN_RULINGS) {
        const mapped = javaEntityTypeToBedrock(ruling.entity);
        if (mapped.kind === 'mapped') rulings.set(mapped.bedrock, ruling);
    }
    return rulings;
};

/** A record with each named key set to its value, or taken off for null. */
const withEntries = (
    map: Record<string, unknown>,
    entries: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
    const result = { ...map };
    for (const [name, value] of Object.entries(entries)) {
        if (value === null) delete result[name];
        else result[name] = value;
    }
    return result;
};

/**
 * Applies Java's spawn rulings to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @param rulings - The ruling of each entity, from {@link javaSpawnRulings}.
 * @returns The same object for a file with no ruling; otherwise a copy with the ruled events and
 *   component groups replaced. An event the file does not declare stays undeclared.
 */
export const withJavaSpawnEvents = (data: unknown, rulings: JavaSpawnRulings): unknown => {
    const identifier = entityFileIdentifier(data);
    const ruling = identifier === undefined ? undefined : rulings.get(identifier);
    if (ruling === undefined || !isRecord(data) || !isRecord(data['minecraft:entity'])) return data;
    const entity = data['minecraft:entity'];
    const declaredEvents = isRecord(entity.events) ? entity.events : {};
    const events: Record<string, unknown> = { ...ruling.added };
    for (const [name, rule] of Object.entries(ruling.events)) {
        const declared = declaredEvents[name];
        if (!isRecord(declared)) continue;
        events[name] = typeof rule === 'function' ? rule(declared) : rule;
    }
    const groups = isRecord(entity.component_groups) ? entity.component_groups : {};
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            events: withEntries(declaredEvents, events),
            component_groups: withEntries(groups, ruling.groups ?? {})
        }
    };
};
