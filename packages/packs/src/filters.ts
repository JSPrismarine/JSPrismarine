/**
 * The Bedrock filter grammar, shared by entity definitions, spawn rules and
 * trade tables. A filter is one test, an array of filters (an implicit
 * `all_of`), or a group map keyed `all_of`, `any_of` or `none_of` with the
 * documented aliases `all`, `AND`, `any`, `OR` and `NOT`. The 1.26 serializer
 * writes `subject` and `operator` as integers in 27 vanilla entity files, so
 * both encodings parse.
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
    /** Extra context for a few tests, such as the equipment slot for `has_equipment`. */
    domain?: string;
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

    const groupKeys = Object.keys(value).filter((key) => key in GROUP_ALIASES);
    if (groupKeys.length > 0) {
        if (groupKeys.length > 1 || Object.keys(value).length > 1)
            throw new FilterParseError(
                `a filter group must have exactly one combinator key, got ${Object.keys(value).join(', ')}`
            );
        const key = groupKeys[0]!;
        const members = value[key];
        if (!Array.isArray(members)) throw new FilterParseError(`${key} must hold an array of filters`);
        return { kind: 'group', combinator: GROUP_ALIASES[key]!, filters: members.map(parseFilter) };
    }

    return parseTest(value);
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
        if (typeof value.domain !== 'string') throw new FilterParseError('domain must be a string');
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
