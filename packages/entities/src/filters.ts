import type { Filter, FilterOperator, FilterSubject, FilterTest } from '@jsprismarine/packs';
import { parseFilter } from '@jsprismarine/packs';

import type {
    EntityFlag,
    EntityMeasure,
    EntityNameSet,
    EquipmentSlot,
    FilterContext,
    FilterEntityView,
    FilterItemView
} from './filterContext';
import { ENTITY_FLAGS, ENTITY_MEASURES, ENTITY_NAME_SETS, EQUIPMENT_SLOTS } from './filterContext';

/**
 * The filter evaluator. `@jsprismarine/packs` owns the grammar and parses both
 * encodings, including the integer `subject` and `operator` the 1.26
 * serializer writes in 27 vanilla entity files; this module evaluates the
 * parsed form against a {@link FilterContext}.
 */

/** What one test compares: a number, a string or a boolean. */
type Fact = number | string | boolean | undefined;

/** Reads the fact one test compares, or undefined when the context cannot answer. */
type TestReader = (subject: FilterEntityView, context: FilterContext, test: FilterTest) => Fact;

/**
 * One test's implementation.
 *
 * Most tests read a fact and let the operator compare it with the test's
 * `value`. Some tests cannot: `is_family` asks whether a set holds the value,
 * `has_equipment` asks whether a slot holds it. Those set `foldsValue`, read
 * the value themselves, and hand back the answer for the operator to compare
 * with `true`.
 */
interface TestEntry {
    readonly read: TestReader;
    readonly foldsValue?: true;
}

/** Declares a test whose reader consumed the test's `value` itself. */
const folds = (read: TestReader): TestEntry => ({ read, foldsValue: true });

const slotOf = (test: FilterTest): EquipmentSlot => EQUIPMENT_SLOTS.find((slot) => slot === test.domain) ?? 'any';

const sameEntity = (a: FilterEntityView | undefined, b: FilterEntityView | undefined): boolean | undefined => {
    if (a === undefined || b === undefined) return false;
    if (a === b) return true;
    const left = a.id?.();
    const right = b.id?.();
    if (left === undefined || right === undefined) return undefined;
    return left === right;
};

/** Splits a `has_equipment` value such as `bucket:1` into its name and auxiliary value. */
const splitItemValue = (value: unknown): { readonly name: string; readonly data?: number } | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = /^(?<name>.*?)(?::(?<data>\d+))?$/.exec(value);
    if (match?.groups === undefined) return { name: value };
    return { name: match.groups.name!, data: match.groups.data === undefined ? undefined : Number(match.groups.data) };
};

/** Compares an item identifier with and without the `minecraft:` namespace. */
const sameItemName = (identifier: string, name: string): boolean =>
    identifier === name || identifier === `minecraft:${name}` || `minecraft:${identifier}` === name;

/** Reads a flag the view answers under its own test name. */
const flag =
    (name: EntityFlag): TestReader =>
    (subject) =>
        subject.flag?.(name);

/** Reads a numeric fact the view answers under its own test name. */
const measure =
    (name: EntityMeasure): TestReader =>
    (subject) =>
        subject.measure?.(name);

/** Tests membership of a name set the view answers under its own test name. */
const inNameSet =
    (name: EntityNameSet): TestReader =>
    (subject, _context, test) => {
        const names = subject.names?.(name);
        if (names === undefined) return undefined;
        if (typeof test.value !== 'string') return false;
        return names.includes(test.value);
    };

/** Finds the first item of a slot, which is what the single-slot equipment tests read. */
const equipmentIn = (subject: FilterEntityView, test: FilterTest): FilterItemView | undefined =>
    subject.equipment?.(slotOf(test), 0);

const readers: ReadonlyMap<string, TestEntry> = new Map<string, TestEntry>([
    ...ENTITY_FLAGS.map((name): readonly [string, TestEntry] => [name, { read: flag(name) }]),
    ...ENTITY_MEASURES.map((name): readonly [string, TestEntry] => [name, { read: measure(name) }]),
    ...ENTITY_NAME_SETS.map((name): readonly [string, TestEntry] => [name, folds(inNameSet(name))]),

    // Properties.
    ['bool_property', { read: (subject, _context, test) => readProperty(subject, test) }],
    ['int_property', { read: (subject, _context, test) => readProperty(subject, test) }],
    ['float_property', { read: (subject, _context, test) => readProperty(subject, test) }],
    ['enum_property', { read: (subject, _context, test) => readProperty(subject, test) }],
    ['has_property', folds((subject, _context, test) => subject.hasProperty?.(domainOrValue(test)))],

    // Components.
    ['has_component', folds((subject, _context, test) => subject.hasComponent?.(String(test.value ?? '')))],

    // Equipment and inventory.
    [
        'has_equipment',
        folds((subject, _context, test) => {
            const item = equipmentIn(subject, test);
            const wanted = splitItemValue(test.value);
            if (wanted === undefined) return undefined;
            if (item === undefined) return sameItemName('minecraft:air', wanted.name);
            if (!sameItemName(item.identifier(), wanted.name)) return false;
            return wanted.data === undefined || item.data?.() === wanted.data;
        })
    ],
    [
        'has_equipment_tag',
        folds((subject, _context, test) => {
            const item = equipmentIn(subject, test);
            if (item === undefined) return false;
            const tags = item.tags?.();
            return tags === undefined ? undefined : tags.includes(String(test.value ?? ''));
        })
    ],
    [
        'has_damaged_equipment',
        folds((subject, _context, test) => {
            const item = equipmentIn(subject, test);
            if (item === undefined) return false;
            const wanted = splitItemValue(test.value);
            if (wanted !== undefined && !sameItemName(item.identifier(), wanted.name)) return false;
            return item.damaged?.();
        })
    ],
    [
        'actor_has_item_with_enchantment_in_slot',
        folds((subject, _context, test) => {
            const item = equipmentIn(subject, test);
            if (item === undefined) return false;
            return (item.enchantment?.(String(test.value ?? '')) ?? 0) > 0;
        })
    ],
    [
        'has_same_equipment_in_slot_as',
        folds((subject, context, test) => {
            const mine = context.self.equipment?.(slotOf(test), 0);
            const theirs = subject.equipment?.(slotOf(test), 0);
            if (mine === undefined || theirs === undefined) return mine === theirs;
            return sameItemName(mine.identifier(), theirs.identifier());
        })
    ],
    [
        'all_slots_empty',
        {
            read: (subject, _context, test) => {
                const fill = subject.slotFill?.(slotOf(test));
                return fill === undefined ? undefined : fill.filled === 0;
            }
        }
    ],
    [
        'any_slot_empty',
        {
            read: (subject, _context, test) => {
                const fill = subject.slotFill?.(slotOf(test));
                return fill === undefined ? undefined : fill.filled < fill.capacity;
            }
        }
    ],
    [
        'has_item_with_component',
        folds((subject, _context, test) =>
            subject.carries?.((item) => item.hasComponent?.(String(test.value ?? '')) === true)
        )
    ],

    // Relations between two subjects.
    ['is_owner', { read: (subject, context) => sameEntity(context.self.owner?.(), subject) }],
    ['is_target', { read: (subject, context) => sameEntity(context.self.attackTarget?.(), subject) }],
    ['is_leashed_to', { read: (subject, context) => sameEntity(subject.leashHolder?.(), context.self) }],
    ['is_riding_self', { read: (subject, context) => sameEntity(subject.vehicle?.(), context.self) }],
    ['is_in_same_vehicle', { read: (subject, context) => sameEntity(subject.vehicle?.(), context.self.vehicle?.()) }],
    ['trusts', { read: (subject, context) => subject.trusts?.(context.self) }],
    [
        'is_vehicle_family',
        folds((subject, _context, test) => {
            const vehicle = subject.vehicle?.();
            if (vehicle === undefined) return false;
            const families = vehicle.names?.('is_family');
            return families === undefined ? undefined : families.includes(String(test.value ?? ''));
        })
    ],

    // World state, read from the world view whatever the subject is.
    ['clock_time', { read: (_subject, context) => context.world?.timeOfDay?.() }],
    [
        'hourly_clock_time',
        {
            read: (_subject, context) => {
                const time = context.world?.timeOfDay?.();
                return time === undefined ? undefined : Math.floor(time / 1000) * 1000;
            }
        }
    ],
    [
        'is_daytime',
        {
            read: (_subject, context) => {
                const time = context.world?.timeOfDay?.();
                return time === undefined ? undefined : time < 12000;
            }
        }
    ],
    ['is_difficulty', { read: (_subject, context) => context.world?.difficulty?.() }],
    [
        'is_game_rule',
        {
            read: (_subject, context, test) => {
                const rule = context.world?.gameRule?.(domainOrValue(test));
                return typeof rule === 'number' ? rule !== 0 : rule;
            }
        }
    ],
    ['moon_phase', { read: (_subject, context) => context.world?.moonPhase?.() }],
    ['moon_intensity', { read: (_subject, context) => context.world?.moonIntensity?.() }],
    ['weather', { read: (_subject, context) => context.world?.weather?.() }],
    ['is_weather', { read: (_subject, context) => context.world?.weather?.() }],
    [
        'in_nether',
        {
            read: (_subject, context) => {
                const dimension = context.world?.dimension?.();
                return dimension === undefined ? undefined : isDimension(dimension, 'nether');
            }
        }
    ],
    [
        'in_overworld',
        {
            read: (_subject, context) => {
                const dimension = context.world?.dimension?.();
                return dimension === undefined ? undefined : isDimension(dimension, 'overworld');
            }
        }
    ],

    // Blocks.
    [
        'is_block',
        folds((_subject, context, test) => {
            const block = context.block;
            if (block === undefined) return undefined;
            return sameItemName(block.identifier(), String(test.value ?? ''));
        })
    ],
    ['is_waterlogged', { read: (_subject, context) => context.block?.waterlogged?.() }],

    // Randomness.
    [
        'random_chance',
        folds((_subject, context, test) => {
            const random = context.random;
            const chances = typeof test.value === 'number' ? test.value : 1;
            if (random === undefined || chances <= 0) return undefined;
            return Math.floor(random.next() * chances) === 0;
        })
    ]
]);

const isDimension = (identifier: string, name: string): boolean =>
    identifier === name || identifier === `minecraft:${name}`;

/**
 * A property test names its property in `domain`; `has_property` also accepts
 * it in `value`. The 1.26 serializer writes `domain` as an integer for the
 * slot tests, so a name is only a name when it is a string.
 */
const domainOrValue = (test: FilterTest): string => {
    const name = test.domain ?? test.value;
    return typeof name === 'string' ? name : '';
};

const readProperty = (subject: FilterEntityView, test: FilterTest): Fact => {
    const name = test.domain;
    if (typeof name !== 'string') return undefined;
    return subject.property?.(name);
};

/**
 * Parses a filter out of an entity definition. `@jsprismarine/packs` owns the
 * grammar and reads every shape the vanilla files write, including the two
 * this package used to rewrite first, so this is its parser under the name
 * the entity side calls it by.
 *
 * @throws {FilterParseError} When the value does not follow the grammar.
 */
export const parseEntityFilter = parseFilter;

/** Every filter test this package evaluates, in name order. */
export const IMPLEMENTED_FILTER_TESTS: readonly string[] = [...readers.keys()].sort();

/** Whether the evaluator knows the named test. */
export const hasFilterTest = (name: string): boolean => readers.has(name);

/** Picks the subject a test reads, or undefined when the context has none under that name. */
const resolveSubject = (subject: FilterSubject, context: FilterContext): FilterEntityView | undefined => {
    switch (subject) {
        case 'self':
            return context.self;
        case 'other':
            return context.other;
        case 'player':
            return context.player;
        case 'target':
            return context.target;
        case 'parent':
            return context.parent;
        case 'baby':
            return context.baby;
        case 'damager':
            return context.damager;
        case 'holder':
            return context.holder;
        // `block` and `item` are not entities; their tests read the context's
        // own block and item views, so the subject resolves to `self` and the
        // test ignores it.
        case 'block':
        case 'item':
            return context.self;
    }
};

/**
 * Compares a fact against a test's `value`.
 *
 * A test that writes no `value` compares against `true`, which is the rule
 * `bool_property` and `has_property` document and the one every boolean test
 * follows in vanilla.
 */
const compare = (fact: Exclude<Fact, undefined>, operator: FilterOperator, value: unknown): boolean => {
    const expected = value === undefined ? true : value;

    if (typeof fact === 'string' || typeof expected === 'string') {
        const order = String(fact).localeCompare(String(expected));
        switch (operator) {
            case '==':
                return order === 0;
            case '!=':
                return order !== 0;
            case '<':
                return order < 0;
            case '<=':
                return order <= 0;
            case '>':
                return order > 0;
            case '>=':
                return order >= 0;
        }
    }

    const left = typeof fact === 'boolean' ? (fact ? 1 : 0) : fact;
    const right = typeof expected === 'boolean' ? (expected ? 1 : 0) : Number(expected);
    switch (operator) {
        case '==':
            return left === right;
        case '!=':
            return left !== right;
        case '<':
            return left < right;
        case '<=':
            return left <= right;
        case '>':
            return left > right;
        case '>=':
            return left >= right;
    }
};

/** Options for {@link evaluateFilter}. */
export interface EvaluateFilterOptions {
    /** Called once per test the evaluator does not implement, or whose subject the context lacks. */
    onUnanswered?: (test: FilterTest, reason: 'unknownTest' | 'missingSubject' | 'missingFact') => void;
}

/**
 * Evaluates one parsed filter.
 *
 * An unknown test, a subject the context does not hold, and a fact no view
 * answers all evaluate to false and report through
 * {@link EvaluateFilterOptions.onUnanswered}, so a filter never stops a tick.
 */
export const evaluateFilter = (
    filter: Filter,
    context: FilterContext,
    options: EvaluateFilterOptions = {}
): boolean => {
    if (filter.kind === 'group') {
        switch (filter.combinator) {
            case 'all_of':
                return filter.filters.every((child) => evaluateFilter(child, context, options));
            case 'any_of':
                return filter.filters.some((child) => evaluateFilter(child, context, options));
            case 'none_of':
                return !filter.filters.some((child) => evaluateFilter(child, context, options));
        }
    }
    return evaluateTest(filter, context, options);
};

const evaluateTest = (test: FilterTest, context: FilterContext, options: EvaluateFilterOptions): boolean => {
    const entry = readers.get(test.test);
    if (entry === undefined) {
        options.onUnanswered?.(test, 'unknownTest');
        return false;
    }

    const subject = resolveSubject(test.subject, context);
    if (subject === undefined) {
        options.onUnanswered?.(test, 'missingSubject');
        return false;
    }

    const fact = entry.read(subject, context, test);
    if (fact === undefined) {
        options.onUnanswered?.(test, 'missingFact');
        return false;
    }

    return compare(fact, test.operator, entry.foldsValue ? undefined : test.value);
};
