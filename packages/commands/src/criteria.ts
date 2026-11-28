/**
 * Scoreboard criteria as Java Edition names them: the custom criteria such as `dummy` and
 * `health`, the team criteria such as `teamkill.red`, and a statistic such as
 * `minecraft.custom:minecraft.play_time`. `/scoreboard objectives add` reads one, and the
 * server's scoreboard reads it back to know which objectives a player's statistics and vitals
 * raise.
 */

/**
 * How the client draws an objective's scores.
 *
 * @javaSee ObjectiveCriteria.getDefaultRenderType
 */
export type CriterionRenderType = 'integer' | 'hearts';

/** A criterion that is not a statistic. */
export interface CustomCriterion {
    readonly kind: 'custom';
    readonly name: string;
    /** Whether a command may not write its scores, which only the game raises. */
    readonly readOnly: boolean;
    readonly renderType: CriterionRenderType;
}

/** A statistic's criterion: `<type>:<stat>`, each half an id with its colon spelled as a dot. */
export interface StatisticCriterion {
    readonly kind: 'statistic';
    /** The criterion as Java stores it, such as `minecraft.custom:minecraft.play_time`. */
    readonly name: string;
    /** The statistic type, such as `minecraft:custom`. */
    readonly type: string;
    /** The entry of the type's registry, such as `minecraft:play_time`. */
    readonly stat: string;
    readonly readOnly: false;
    readonly renderType: 'integer';
}

/** One scoreboard criterion. */
export type Criterion = CustomCriterion | StatisticCriterion;

/**
 * The entries each statistic type counts, by the type's id: `minecraft:custom` to the custom
 * statistics, `minecraft:mined` to the blocks, and so on.
 */
export type StatisticEntries = Readonly<Record<string, readonly string[]>>;

/**
 * The colors a team criterion is registered for, as `TeamColor` serializes them.
 *
 * @javaSee TeamColor.getSerializedName
 */
const TEAM_COLORS = [
    'black',
    'dark_blue',
    'dark_green',
    'dark_aqua',
    'dark_red',
    'dark_purple',
    'gold',
    'gray',
    'dark_gray',
    'blue',
    'green',
    'aqua',
    'red',
    'light_purple',
    'yellow',
    'white'
] as const;

const custom = (name: string, readOnly = false, renderType: CriterionRenderType = 'integer'): CustomCriterion => ({
    kind: 'custom',
    name,
    readOnly,
    renderType
});

/**
 * Every criterion that is not a statistic, in the order Java registers them.
 *
 * @javaSee ObjectiveCriteria.CUSTOM_CRITERIA
 */
const CUSTOM_CRITERIA: readonly CustomCriterion[] = [
    custom('dummy'),
    custom('trigger'),
    custom('deathCount'),
    custom('playerKillCount'),
    custom('totalKillCount'),
    custom('health', true, 'hearts'),
    custom('food', true),
    custom('air', true),
    custom('armor', true),
    custom('xp', true),
    custom('level', true),
    ...TEAM_COLORS.map((color) => custom(`teamkill.${color}`)),
    ...TEAM_COLORS.map((color) => custom(`killedByTeam.${color}`))
];

const CUSTOM_BY_NAME: ReadonlyMap<string, CustomCriterion> = new Map(
    CUSTOM_CRITERIA.map((criterion) => [criterion.name, criterion])
);

/** The names of every criterion that is not a statistic, in Java's order. */
export const CUSTOM_CRITERION_NAMES: readonly string[] = CUSTOM_CRITERIA.map(({ name }) => name);

/** Java's id characters: a namespace of `[a-z0-9_.-]`, a path that may also hold `/`. */
const NAMESPACE = /^[a-z0-9_.-]+$/;
const PATH = /^[a-z0-9_./-]+$/;

/**
 * An id written with `separator` in place of its colon, as a statistic criterion writes both of
 * its halves. No separator means the `minecraft` namespace.
 *
 * @javaSource Identifier.bySeparator
 */
const idBySeparator = (text: string, separator: string): string | undefined => {
    const at = text.indexOf(separator);
    const namespace = at > 0 ? text.slice(0, at) : 'minecraft';
    const path = at >= 0 ? text.slice(at + 1) : text;
    return NAMESPACE.test(namespace) && PATH.test(path) ? `${namespace}:${path}` : undefined;
};

/** An id with its colon spelled as a dot, which is how a statistic's name writes each half. */
const dotted = (id: string): string => id.replace(':', '.');

/**
 * Looks a criterion up by the name a command or a save spells it with.
 *
 * A statistic is `<type>:<stat>`, such as `minecraft.custom:minecraft.play_time`. Each half may
 * leave its namespace out, as `custom:play_time` does, and the criterion handed back always
 * carries the full name Java stores.
 *
 * @param name - The criterion's name.
 * @param statistics - The entries each statistic type counts. Left out, any well-formed
 *   statistic is accepted, since there is no table to check it against.
 * @returns The criterion, or undefined when Java would not know it.
 * @javaSource ObjectiveCriteria.byName
 */
export const criterionByName = (name: string, statistics?: StatisticEntries): Criterion | undefined => {
    const known = CUSTOM_BY_NAME.get(name);
    if (known !== undefined) return known;

    const colon = name.indexOf(':');
    if (colon < 0) return undefined;
    const type = idBySeparator(name.slice(0, colon), '.');
    const stat = idBySeparator(name.slice(colon + 1), '.');
    if (type === undefined || stat === undefined) return undefined;

    if (statistics !== undefined) {
        const entries = statistics[type];
        if (entries === undefined || !entries.includes(stat)) return undefined;
    }
    return {
        kind: 'statistic',
        name: statisticCriterionName(type, stat),
        type,
        stat,
        readOnly: false,
        renderType: 'integer'
    };
};

/**
 * The criterion name of one statistic, as {@link criterionByName} hands it back.
 *
 * @param type - The statistic type, such as `minecraft:custom`.
 * @param stat - The entry, such as `minecraft:play_time`.
 * @javaSource Stat.buildName
 */
export const statisticCriterionName = (type: string, stat: string): string => `${dotted(type)}:${dotted(stat)}`;
