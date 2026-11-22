/**
 * Where the documentation is published. Every error links to its entry in the error reference
 * under this address, so a log line leads straight to what the error means.
 */
export const DOCS_URL = 'https://jsprismarine.dev/';

/**
 * What every catalog error carries besides its message: a stable `code`, a `docs` link to the error
 * reference, and the `params` the message was built from. {@link isJSPrismarineError} tells whether
 * a value is one.
 */
export interface CatalogedError extends Error {
    /** The catalog code, such as `LEVELDB_DATABASE_LOCKED`. It never changes between releases. */
    readonly code: string;
    /** The address of this error's entry in the error reference. */
    readonly docs: string;
    /** The placeholder values the message was built from. */
    readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Marks a catalog error. Every copy of this package uses the same key, so
 * {@link isJSPrismarineError} recognizes an error that another installed copy built, which
 * `instanceof` a root of this copy does not. It is a getter on each root's prototype rather than an
 * own property, so `util.inspect` leaves it out.
 */
const cataloged = Symbol.for('@jsprismarine/errors.cataloged');

/**
 * The root of the catalog errors that extend `Error`, directly or through a category. An entry
 * built on `TypeError`, `RangeError` or `ReferenceError` extends {@link JSPrismarineTypeError},
 * {@link JSPrismarineRangeError} or {@link JSPrismarineReferenceError} instead, so test for any
 * catalog error with {@link isJSPrismarineError}.
 */
export abstract class JSPrismarineError extends Error implements CatalogedError {
    public abstract readonly code: string;
    public abstract readonly docs: string;
    public abstract readonly params: Readonly<Record<string, unknown>>;

    public get [cataloged](): true {
        return true;
    }
}

/** The root of the catalog errors that extend `TypeError`. */
export abstract class JSPrismarineTypeError extends TypeError implements CatalogedError {
    public abstract readonly code: string;
    public abstract readonly docs: string;
    public abstract readonly params: Readonly<Record<string, unknown>>;

    public get [cataloged](): true {
        return true;
    }
}

/** The root of the catalog errors that extend `RangeError`. */
export abstract class JSPrismarineRangeError extends RangeError implements CatalogedError {
    public abstract readonly code: string;
    public abstract readonly docs: string;
    public abstract readonly params: Readonly<Record<string, unknown>>;

    public get [cataloged](): true {
        return true;
    }
}

/** The root of the catalog errors that extend `ReferenceError`. */
export abstract class JSPrismarineReferenceError extends ReferenceError implements CatalogedError {
    public abstract readonly code: string;
    public abstract readonly docs: string;
    public abstract readonly params: Readonly<Record<string, unknown>>;

    public get [cataloged](): true {
        return true;
    }
}

/**
 * True for every error the catalog defines, whichever built-in error it extends and whichever
 * installed copy of this package built it. Prefer it to `instanceof JSPrismarineError`, which misses
 * the entries built on `TypeError`, `RangeError` and `ReferenceError`, and the errors of another
 * copy. A subclass of a category that sets no `code`, `docs` and `params` does not count.
 */
export const isJSPrismarineError = (value: unknown): value is CatalogedError =>
    typeof value === 'object' &&
    value !== null &&
    cataloged in value &&
    'code' in value &&
    typeof value.code === 'string' &&
    'docs' in value &&
    typeof value.docs === 'string' &&
    'params' in value &&
    typeof value.params === 'object' &&
    value.params !== null;

/** `CannotAddToFinishedBlock` or `native-network` as `CANNOT_ADD_TO_FINISHED_BLOCK` or `NATIVE_NETWORK`. */
export const constantCase = (name: string) =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toUpperCase();

/** The anchor the error reference gives a code's heading, as VitePress slugs it. */
export const codeAnchor = (code: string) => code.toLowerCase().replaceAll('_', '-');

/**
 * The address of a code's entry in the error reference. A domain split across modules has a page per
 * module, under the domain's folder.
 */
export const docsUrlOf = (domain: string, code: string, module?: string) =>
    `${DOCS_URL}errors/${module ? `${domain}/${module}` : domain}#${codeAnchor(code)}`;
