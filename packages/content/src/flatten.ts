import { ContentError } from './errors';

/**
 * The typed arrays a flattened column can use, with whether the kind holds
 * whole numbers and whether it holds negative ones. The value ranges come out
 * of each constructor's `BYTES_PER_ELEMENT`, so this table is the only place a
 * kind is declared.
 */
export const COLUMN_KINDS = {
    i8: { array: Int8Array, integer: true, signed: true },
    i16: { array: Int16Array, integer: true, signed: true },
    i32: { array: Int32Array, integer: true, signed: true },
    u8: { array: Uint8Array, integer: true, signed: false },
    u16: { array: Uint16Array, integer: true, signed: false },
    u32: { array: Uint32Array, integer: true, signed: false },
    f32: { array: Float32Array, integer: false, signed: true },
    f64: { array: Float64Array, integer: false, signed: true }
} as const;

/** One of {@link COLUMN_KINDS}. */
export type ColumnKind = keyof typeof COLUMN_KINDS;

/** The typed array one column kind produces. */
export type ColumnArray<K extends ColumnKind> = InstanceType<(typeof COLUMN_KINDS)[K]['array']>;

/** One column of a flattened table. */
export interface ColumnSpec<T, K extends ColumnKind = ColumnKind> {
    /** The typed array the column stores. */
    readonly kind: K;
    /**
     * Reads the column's value for one source.
     *
     * @returns The value, or undefined when the source has none, which then
     *   needs the column's `default` or a reviewed exception.
     */
    read(source: T): number | undefined;
    /** Stored for any id the sources leave without a value. */
    readonly default?: number;
}

/** The columns a flattened table holds, keyed by the name the caller indexes them under. */
export type Columns<T> = Readonly<Record<string, ColumnSpec<T>>>;

/**
 * One id a column has no source value for, reviewed and written down.
 *
 * The list works like the mapping package's loss list: every gap is a row with
 * a reason, and a row that matches nothing fails the build, so the list cannot
 * outlive the gap it covers.
 */
export interface FlattenException {
    /** The dense id with no source value. */
    id: number;
    /** The column name, or omitted to cover every column of that id. */
    column?: string;
    /** The value to store instead. */
    value: number;
    /** Why the id has no source value. The failure message quotes it when the row matches nothing. */
    reason: string;
}

/** What to flatten and how, including the reviewed exceptions. */
export interface FlattenSpec<T, C extends Columns<T>> {
    /** The dense id of one source. Ids run from 0 to `length - 1` with no repeats. */
    id: (source: T) => number;
    /** How many ids the arrays cover. */
    length: number;
    columns: C;
    exceptions?: readonly FlattenException[];
}

/** The flattened table: one typed array per column, indexed by the dense id. */
export type FlatTable<C extends Columns<never>> = {
    readonly [K in keyof C]: ColumnArray<C[K]['kind']>;
};

/** Error thrown when a table cannot be flattened. */
export class FlattenError extends ContentError {
    public override name = 'FlattenError';
}

/** The inclusive value range a column kind holds. */
const rangeOf = (kind: ColumnKind): readonly [number, number] => {
    const { array, integer, signed } = COLUMN_KINDS[kind];
    if (!integer) return [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    const bits = array.BYTES_PER_ELEMENT * 8;
    return signed ? [-(2 ** (bits - 1)), 2 ** (bits - 1) - 1] : [0, 2 ** bits - 1];
};

const check = (kind: ColumnKind, column: string, id: number, value: number): void => {
    const [min, max] = rangeOf(kind);
    if (!Number.isFinite(value)) {
        throw new FlattenError(`column ${column} got ${value} at id ${id}, which a ${kind} array cannot hold`);
    }
    if (COLUMN_KINDS[kind].integer && !Number.isInteger(value)) {
        throw new FlattenError(`column ${column} got ${value} at id ${id}, which a ${kind} array would truncate`);
    }
    if (value < min || value > max) {
        throw new FlattenError(`column ${column} got ${value} at id ${id}, outside the ${kind} range ${min} to ${max}`);
    }
};

/**
 * Flattens resolved types into one typed array per column, indexed by a dense
 * numeric id, so a hot path reads an array slot instead of calling through a
 * type. This is Dragonfly's `Finalize` idea: precompute at load, so lighting
 * and tick selection never ask a type anything.
 *
 * A column with no value for an id falls back to the column's `default`, then
 * to a reviewed exception. An id with neither fails the build, and so does an
 * exception that matched nothing.
 *
 * @param sources - The resolved types, in any order; `spec.id` places each one.
 * @throws {FlattenError} On a duplicate or out-of-range id, a value the column
 *   kind cannot hold, an id with no value and no exception, or an unused exception.
 */
export const flatten = <T, C extends Columns<T>>(sources: Iterable<T>, spec: FlattenSpec<T, C>): FlatTable<C> => {
    const names = Object.keys(spec.columns);
    const arrays: Record<string, ColumnArray<ColumnKind>> = {};
    const filled: Record<string, Uint8Array> = {};
    for (const name of names) {
        arrays[name] = new COLUMN_KINDS[spec.columns[name]!.kind].array(spec.length);
        filled[name] = new Uint8Array(spec.length);
    }

    const placed = new Set<number>();
    for (const source of sources) {
        const id = spec.id(source);
        if (!Number.isInteger(id) || id < 0 || id >= spec.length) {
            throw new FlattenError(`a source claims id ${id}, outside the 0 to ${spec.length - 1} range`);
        }
        if (placed.has(id)) throw new FlattenError(`two sources claim id ${id}`);
        placed.add(id);

        for (const name of names) {
            const column = spec.columns[name]!;
            const value = column.read(source);
            if (value === undefined) continue;
            check(column.kind, name, id, value);
            arrays[name]![id] = value;
            filled[name]![id] = 1;
        }
    }

    const exceptions = spec.exceptions ?? [];
    const used = new Set<FlattenException>();
    const missing: string[] = [];

    for (const name of names) {
        const column = spec.columns[name]!;
        for (let id = 0; id < spec.length; id += 1) {
            if (filled[name]![id] === 1) continue;

            if (column.default !== undefined) {
                check(column.kind, name, id, column.default);
                arrays[name]![id] = column.default;
                continue;
            }

            const exception = exceptions.find(
                (candidate) => candidate.id === id && (candidate.column === undefined || candidate.column === name)
            );
            if (!exception) {
                missing.push(`${name}[${id}]`);
                continue;
            }

            check(column.kind, name, id, exception.value);
            arrays[name]![id] = exception.value;
            used.add(exception);
        }
    }

    if (missing.length > 0) {
        const shown = missing.slice(0, 10).join(', ');
        const rest = missing.length > 10 ? `, and ${missing.length - 10} more` : '';
        throw new FlattenError(`no value and no reviewed exception for ${shown}${rest}`);
    }

    const unused = exceptions.filter((exception) => !used.has(exception));
    if (unused.length > 0) {
        const shown = unused
            .map((exception) => `${exception.column ?? '*'}[${exception.id}] (${exception.reason})`)
            .join(', ');
        throw new FlattenError(`reviewed exceptions matched nothing and should be removed: ${shown}`);
    }

    // Each array was built from its own column's kind, which the mapped return
    // type restates; TypeScript cannot carry that through a string-keyed record.
    return arrays as FlatTable<C>;
};
