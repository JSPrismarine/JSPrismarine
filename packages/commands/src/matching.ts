/**
 * Resolving a parsed selector against a list of candidates.
 *
 * {@link parseSelector} answers what a selector string *says*; this answers
 * which entities it *names*. The split is deliberate: the grammar belongs to
 * the edition the string was typed in, and the matching belongs to Java's
 * `EntitySelector`, which both dialects normalize onto.
 *
 * Matching is a pure function over candidates the caller supplies, so a host
 * only has to produce the entities in range and answer the handful of facts an
 * `EntityRef` does not carry. The order Java applies is kept, because it is
 * observable: filter, then sort, then cut to the limit. A `@p` in a crowd is
 * the nearest match of the filtered set, not the nearest candidate that
 * happens to pass.
 *
 * Sources: `EntitySelector`, `EntitySelectorParser` and `EntitySelectorOptions`
 * in the Java 26.3 server jar.
 */
import type { CommandSource, EntityRef } from './host';
import type { SelectorBase, SelectorModel, SelectorRange, SelectorSort, SelectorTest } from './selector';

/**
 * The facts a selector tests that an {@link EntityRef} does not carry.
 *
 * Each is optional, and an absent answer never matches a test that asks for
 * it: Java's `gamemode=` cannot select an entity that has no game mode, so a
 * host that does not track one is told apart from a host that tracks it and
 * disagrees.
 */
export interface SelectorFacts {
    /** The player's game mode, unnamespaced, as `gamemode=` spells it. */
    gameMode(entity: EntityRef): string | undefined;
    /** The player's experience level, which `level=` ranges over. */
    level(entity: EntityRef): number | undefined;
    /** The entity's `tag=` set. */
    tags(entity: EntityRef): readonly string[];
    /** One score of one objective, which `scores={...}` ranges over. */
    score(entity: EntityRef, objective: string): number | undefined;
    /** The `minecraft:type_family` values Bedrock's `family=` tests. */
    families(entity: EntityRef): readonly string[];
}

/** What {@link matchSelector} needs besides the selector itself. */
export interface MatchSelectorOptions {
    /** The candidates to filter, usually every entity in the source's dimension. */
    readonly candidates: readonly EntityRef[];
    /**
     * The facts an `EntityRef` does not carry. A fact left out answers
     * `undefined`, so any test that reads it fails.
     */
    readonly facts?: Partial<SelectorFacts>;
    /** Where `sort=random` and `@r` draw from. Defaults to `Math.random`. */
    readonly random?: () => number;
}

/** The base selectors that only ever name players. */
const PLAYER_ONLY: readonly SelectorBase[] = ['@a', '@p', '@r'];

/** What each base selector sorts by before `limit` cuts the list. */
const BASE_SORT: Readonly<Record<SelectorBase, SelectorSort>> = {
    '@a': 'arbitrary',
    '@e': 'arbitrary',
    '@n': 'nearest',
    '@p': 'nearest',
    '@r': 'random',
    '@s': 'arbitrary',
    '@initiator': 'arbitrary'
};

/** The number of matches each base selector returns when the string sets no `limit`. */
const BASE_LIMIT: Readonly<Record<SelectorBase, number | undefined>> = {
    '@a': undefined,
    '@e': undefined,
    '@n': 1,
    '@p': 1,
    '@r': 1,
    '@s': 1,
    '@initiator': 1
};

const inRange = (value: number, range: SelectorRange): boolean =>
    (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);

/** Java wraps a yaw onto `(-180, 180]` before comparing it, so `y_rotation=170..190` works. */
const wrapDegrees = (degrees: number): number => {
    const wrapped = degrees % 360;
    if (wrapped >= 180) return wrapped - 360;
    if (wrapped < -180) return wrapped + 360;
    return wrapped;
};

/**
 * Applies a list of `!`-able tests.
 *
 * Java's rule, which reads oddly until you see why: a selector may carry any
 * number of negative tests and at most one positive one, so an entity has to
 * fail every negative test and match the positive test if there is one.
 */
const passesTests = <T>(tests: readonly SelectorTest<T>[], matches: (expected: T) => boolean): boolean => {
    for (const test of tests) {
        if (matches(test.value) === test.negated) return false;
    }
    return true;
};

/** `pig` and `minecraft:pig` are the same type to a selector. */
const sameIdentifier = (left: string, right: string): boolean => {
    const bare = (value: string) => (value.startsWith('minecraft:') ? value.slice('minecraft:'.length) : value);
    return bare(left) === bare(right);
};

const distanceSquared = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): number =>
    (from.x - to.x) ** 2 + (from.y - to.y) ** 2 + (from.z - to.z) ** 2;

/** The origin a selector measures `distance`, `dx` and `sort=nearest` from. */
const originOf = (selector: SelectorModel, source: CommandSource) => ({
    x:
        selector.x === undefined
            ? source.position.x
            : selector.x.relative
              ? source.position.x + selector.x.value
              : selector.x.value,
    y:
        selector.y === undefined
            ? source.position.y
            : selector.y.relative
              ? source.position.y + selector.y.value
              : selector.y.value,
    z:
        selector.z === undefined
            ? source.position.z
            : selector.z.relative
              ? source.position.z + selector.z.value
              : selector.z.value
});

/**
 * Whether a position lies in the `dx`/`dy`/`dz` volume.
 *
 * Java builds the box from the origin to `origin + d + 1` on each axis the
 * selector names and leaves the others unbounded, which is why `dx=0` still
 * selects the block column the origin stands in.
 */
const inVolume = (
    position: { x: number; y: number; z: number },
    origin: { x: number; y: number; z: number },
    selector: SelectorModel
): boolean => {
    const axis = (value: number, base: number, size: number | undefined): boolean => {
        if (size === undefined) return true;
        const low = Math.min(base, base + size);
        const high = Math.max(base, base + size) + 1;
        return value >= low && value <= high;
    };
    return (
        axis(position.x, origin.x, selector.dx) &&
        axis(position.y, origin.y, selector.dy) &&
        axis(position.z, origin.z, selector.dz)
    );
};

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const pick = Math.floor(random() * (index + 1));
        [copy[index], copy[pick]] = [copy[pick]!, copy[index]!];
    }
    return copy;
};

/**
 * Resolves one parsed selector against a list of candidates.
 *
 * `@s` and `@initiator` answer the source's own entity and never look at the
 * candidates, which is how Java keeps `execute as @e run ... @s` cheap and
 * correct inside a fork.
 *
 * @param selector - A selector from {@link parseSelector}, in either dialect.
 * @param source - The frame of reference: position for distances, entity for `@s`.
 * @returns The matches, already sorted and cut to the selector's limit.
 */
export const matchSelector = (
    selector: SelectorModel,
    source: CommandSource,
    options: MatchSelectorOptions
): readonly EntityRef[] => {
    const facts = options.facts ?? {};
    const origin = originOf(selector, source);

    const pool: readonly EntityRef[] =
        selector.base === '@s' || selector.base === '@initiator'
            ? source.entity === undefined
                ? []
                : [source.entity]
            : selector.literal === undefined
              ? options.candidates
              : options.candidates.filter(
                    (candidate) => candidate.id === selector.literal || candidate.name === selector.literal
                );

    const matches = pool.filter((entity) => {
        if (PLAYER_ONLY.includes(selector.base) && !entity.isPlayer) return false;
        if (!passesTests(selector.type, (type) => sameIdentifier(entity.type, type))) return false;
        if (!passesTests(selector.name, (name) => entity.name === name)) return false;

        if (!inVolume(entity.position, origin, selector)) return false;
        // `distance` and a `d*` volume are independent in Java: a selector may
        // carry both, and the volume is not a substitute for the radius.
        if (selector.distance !== undefined) {
            const squared = distanceSquared(entity.position, origin);
            const { min, max } = selector.distance;
            if (min !== undefined && squared < min * min) return false;
            if (max !== undefined && squared > max * max) return false;
        }

        if (selector.xRotation !== undefined && !inRange(wrapDegrees(entity.rotation.pitch), selector.xRotation)) {
            return false;
        }
        if (selector.yRotation !== undefined && !inRange(wrapDegrees(entity.rotation.yaw), selector.yRotation)) {
            return false;
        }

        if (selector.gamemode.length > 0) {
            const mode = facts.gameMode?.(entity);
            if (mode === undefined) return false;
            if (!passesTests(selector.gamemode, (expected) => mode === expected)) return false;
        }

        if (selector.level !== undefined) {
            const level = facts.level?.(entity);
            if (level === undefined || !inRange(level, selector.level)) return false;
        }

        if (selector.tag.length > 0) {
            const tags = facts.tags?.(entity) ?? [];
            // A bare `tag=` with no value asks whether the entity has any tag
            // at all, which Java spells as an empty expected value.
            if (
                !passesTests(selector.tag, (expected) => (expected === '' ? tags.length > 0 : tags.includes(expected)))
            ) {
                return false;
            }
        }

        for (const test of selector.scores) {
            const score = facts.score?.(entity, test.objective);
            const held = score !== undefined && inRange(score, test.range);
            if (held === test.negated) return false;
        }

        if (selector.family.length > 0) {
            const families = facts.families?.(entity) ?? [];
            if (!passesTests(selector.family, (expected) => families.includes(expected))) return false;
        }

        return true;
    });

    const sort = selector.sort ?? BASE_SORT[selector.base];
    const ordered =
        sort === 'nearest'
            ? [...matches].sort(
                  (left, right) => distanceSquared(left.position, origin) - distanceSquared(right.position, origin)
              )
            : sort === 'furthest'
              ? [...matches].sort(
                    (left, right) => distanceSquared(right.position, origin) - distanceSquared(left.position, origin)
                )
              : sort === 'random'
                ? shuffled(matches, options.random ?? Math.random)
                : matches;

    const limit = selector.limit ?? BASE_LIMIT[selector.base];
    return limit === undefined ? ordered : ordered.slice(0, limit);
};
