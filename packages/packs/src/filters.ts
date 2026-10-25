/**
 * The Bedrock filter grammar, shared by entity definitions, spawn rules and
 * trade tables. A filter is one test, an array of filters (an implicit
 * `all_of`), or a group map keyed `all_of`, `any_of` or `none_of` with the
 * documented aliases `all`, `AND`, `any`, `OR` and `NOT`. The 1.26 serializer
 * writes `subject` and `operator` as integers in 27 vanilla entity files, so
 * both encodings parse.
 *
 * Mojang's own `Filter Group Map.json` declares each combinator as an
 * optional property holding a whole filter group, so a map may carry several
 * combinators and a combinator may hold one test rather than an array. The
 * vanilla files use both: the tnt_minecart writes `all_of` beside `any_of`,
 * and the witch writes `none_of` over a single test. Each clause of a map has
 * to pass for the map to pass, which makes several clauses an implicit
 * `all_of` over them.
 */

/** Whom a filter test reads, in the engine's int16 enum order. */
export const FILTER_SUBJECTS = [
    'self',
    'other',
    'player',
    'target',
    'parent',
    'baby',
    'block',
    'damager',
    'holder',
    'item'
] as const;

/** Whom a filter test reads. */
export type FilterSubject = (typeof FILTER_SUBJECTS)[number];

/** A comparison operator, normalized to the canonical spellings. */
export type FilterOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

const OPERATOR_ALIASES: Record<string, FilterOperator> = {
    '==': '==',
    '=': '==',
    equals: '==',
    '!=': '!=',
    '<>': '!=',
    not: '!=',
    '<': '<',
    '<=': '<=',
    '>': '>',
    '>=': '>='
};

/** The integer encoding the 1.26 serializer writes: 0 is `==`, 1 is `!=`. */
const OPERATOR_CODES: Record<number, FilterOperator> = { 0: '==', 1: '!=' };

const GROUP_ALIASES: Record<string, 'all_of' | 'any_of' | 'none_of'> = {
    all_of: 'all_of',
    all: 'all_of',
    AND: 'all_of',
    any_of: 'any_of',
    any: 'any_of',
    OR: 'any_of',
    none_of: 'none_of',
    NOT: 'none_of'
};

/** One normalized filter test. */
export interface FilterTest {
    kind: 'test';
    test: string;
    /** Defaults to `self` when the file writes none. */
    subject: FilterSubject;
    /** Defaults to `==` when the file writes none. */
    operator: FilterOperator;
    /**
     * Extra context for a few tests, such as the equipment slot for
     * `has_equipment`. The schema types it like `value`, and the 1.26
     * serializer writes the slot as an integer in the piglin's files, so it
     * stays as written rather than being forced to a name.
     */
    domain?: string | number | boolean;
    value?: string | number | boolean;
}

/** A normalized combinator over nested filters. */
export interface FilterGroup {
    kind: 'group';
    combinator: 'all_of' | 'any_of' | 'none_of';
    filters: Filter[];
}

/** A parsed filter: one test or a combinator over nested filters. */
export type Filter = FilterTest | FilterGroup;

/** Error thrown when a filter value does not follow the grammar. */
export class FilterParseError extends Error {
    public override name = 'FilterParseError';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The legacy shorthand where the key names the test and carries its subject,
 * and the value is what the test compares against. The skeleton's
 * `minecraft:lightning_immune` damage sensor is the one vanilla filter that
 * still writes it, as `{"other_with_families": "lightning"}`.
 */
const SHORTHANDS: Record<string, { readonly test: string; readonly subject: FilterSubject }> = {
    other_with_families: { test: 'is_family', subject: 'other' }
};

/**
 * Parses a filter from its JSON form into the normalized shape: aliases
 * resolve to their canonical combinator, integer subjects and operators
 * resolve to their names, and the `self` and `==` defaults are filled in.
 *
 * @throws {FilterParseError} When the value does not follow the grammar.
 */
export const parseFilter = (value: unknown): Filter => {
    if (Array.isArray(value)) return { kind: 'group', combinator: 'all_of', filters: value.map(parseFilter) };
    if (!isRecord(value))
        throw new FilterParseError(`a filter must be an object or array, got ${JSON.stringify(value)}`);

    const keys = Object.keys(value);
    const groupKeys = keys.filter((key) => key in GROUP_ALIASES);
    if (groupKeys.length > 0) {
        const rest = keys.filter((key) => !(key in GROUP_ALIASES));
        if (rest.length > 0)
            throw new FilterParseError(`a filter group map holds only combinator keys, got ${rest.join(', ')}`);
        const clauses = groupKeys.map((key) => parseGroup(key, value[key]));
        return clauses.length === 1 ? clauses[0]! : { kind: 'group', combinator: 'all_of', filters: clauses };
    }

    const shorthand = keys.length === 1 ? SHORTHANDS[keys[0]!] : undefined;
    if (shorthand) return parseShorthand(shorthand, value[keys[0]!]);

    return parseTest(value);
};

/** Parses one clause of a group map; its value is a whole filter group. */
const parseGroup = (key: string, members: unknown): FilterGroup => ({
    kind: 'group',
    combinator: GROUP_ALIASES[key]!,
    filters: Array.isArray(members) ? members.map(parseFilter) : [parseFilter(members)]
});

/** Expands one legacy shorthand; a list of values reads as any of them. */
const parseShorthand = (spec: { readonly test: string; readonly subject: FilterSubject }, value: unknown): Filter => {
    if (Array.isArray(value))
        return { kind: 'group', combinator: 'any_of', filters: value.map((member) => parseShorthand(spec, member)) };
    return parseTest({ test: spec.test, subject: spec.subject, value });
};

const parseTest = (value: Record<string, unknown>): FilterTest => {
    if (typeof value.test !== 'string') throw new FilterParseError('a filter test needs a string test name');

    const test: FilterTest = {
        kind: 'test',
        test: value.test,
        subject: parseSubject(value.subject),
        operator: parseOperator(value.operator)
    };
    if (value.domain !== undefined) {
        if (typeof value.domain !== 'string' && typeof value.domain !== 'number' && typeof value.domain !== 'boolean')
            throw new FilterParseError('domain must be a string, number or boolean');
        test.domain = value.domain;
    }
    if (value.value !== undefined) {
        if (typeof value.value !== 'string' && typeof value.value !== 'number' && typeof value.value !== 'boolean')
            throw new FilterParseError('value must be a string, number or boolean');
        test.value = value.value;
    }
    return test;
};

const parseSubject = (value: unknown): FilterSubject => {
    if (value === undefined) return 'self';
    if (typeof value === 'number') {
        const subject = FILTER_SUBJECTS[value];
        if (!subject) throw new FilterParseError(`unknown integer subject ${value}`);
        return subject;
    }
    const subject = FILTER_SUBJECTS.find((name) => name === value);
    if (subject) return subject;
    throw new FilterParseError(`unknown subject ${JSON.stringify(value)}`);
};

const parseOperator = (value: unknown): FilterOperator => {
    if (value === undefined) return '==';
    if (typeof value === 'number') {
        const operator = OPERATOR_CODES[value];
        if (!operator) throw new FilterParseError(`unknown integer operator ${value}`);
        return operator;
    }
    if (typeof value === 'string' && OPERATOR_ALIASES[value]) return OPERATOR_ALIASES[value];
    throw new FilterParseError(`unknown operator ${JSON.stringify(value)}`);
};
