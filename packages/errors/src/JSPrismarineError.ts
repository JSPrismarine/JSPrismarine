/**
 * Where the documentation is published. Every error links to its entry in the error reference
 * under this address, so a log line leads straight to what the error means.
 */
export const DOCS_URL = 'https://jsprismarine.dev/';

/**
 * Marks an instance as made by {@link defineErrors}. A catalog entry may extend `TypeError` or
 * `RangeError` rather than {@link JSPrismarineError}, so the prototype chain alone cannot say
 * whether a value came from the catalog.
 */
const cataloged = Symbol.for('@jsprismarine/errors.cataloged');

/**
 * The root of every error the catalog defines. Each one carries a stable `code` and a `docs` link
 * to the error reference, and `instanceof JSPrismarineError` holds for all of them, including the
 * ones built on `TypeError` or `RangeError`.
 */
export abstract class JSPrismarineError extends Error {
    /** The catalog code, such as `LEVELDB_DATABASE_LOCKED`. It never changes between releases. */
    declare public readonly code: string;
    /** The address of this error's entry in the error reference. */
    declare public readonly docs: string;
    /** The placeholder values the message was built from. */
    declare public readonly params: Readonly<Record<string, unknown>>;

    /** True for any error {@link defineErrors} made; plain `instanceof` for subclasses. */
    public static override [Symbol.hasInstance](value: unknown): boolean {
        if (this !== JSPrismarineError) return Function.prototype[Symbol.hasInstance].call(this, value);
        return typeof value === 'object' && value !== null && cataloged in value;
    }
}

/** A class a catalog entry may extend: `Error`, `TypeError`, `RangeError` or a category of the catalog's own. */
export type ErrorBase = abstract new (message?: string, options?: ErrorOptions) => Error;

/** A catalog entry: its message template, and optionally the class it extends. */
export interface ErrorEntry {
    /** The message, with `{name}` placeholders the throw site fills in. */
    readonly message: string;
    /** The class the error extends. Defaults to `Error`. */
    readonly base?: ErrorBase;
}

type MessageOf<Entry> = Entry extends string ? Entry : Entry extends ErrorEntry ? Entry['message'] : never;

type BaseOf<Entry> = Entry extends { readonly base: infer Base extends ErrorBase } ? Base : ErrorConstructor;

/** The placeholder names in a message template, such as `'file' | 'reason'` for `'{file}: {reason}'`. */
export type Placeholders<Message extends string> = Message extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

/** The values a throw site passes for a template's placeholders. */
export type ErrorParams<Message extends string> = { readonly [Name in Placeholders<Message>]: unknown };

/** The constructor arguments of an error: its placeholder values when it has any, then `{ cause }`. */
export type ErrorArgs<Message extends string> = [Placeholders<Message>] extends [never]
    ? [options?: ErrorOptions]
    : [params: ErrorParams<Message>, options?: ErrorOptions];

/** What every catalog error adds to the class it extends. */
export interface CatalogedError<Message extends string = string> {
    /** The catalog code, such as `LEVELDB_DATABASE_LOCKED`. */
    readonly code: string;
    /** The address of this error's entry in the error reference. */
    readonly docs: string;
    /** The placeholder values the message was built from. */
    readonly params: ErrorParams<Message>;
}

/** The class a catalog entry becomes, with the entry's code, domain and template as statics. */
export interface ErrorClass<Message extends string, Base extends ErrorBase> {
    new (...args: ErrorArgs<Message>): InstanceType<Base> & CatalogedError<Message>;
    readonly prototype: InstanceType<Base> & CatalogedError<Message>;
    /** The catalog code, such as `LEVELDB_DATABASE_LOCKED`. */
    readonly code: string;
    /** The catalog the entry belongs to, which is also the name of its page in the error reference. */
    readonly domain: string;
    /** The message template, with its `{name}` placeholders. */
    readonly template: Message;
    /** The address of this error's entry in the error reference. */
    readonly docs: string;
}

/** The classes {@link defineErrors} returns, one per entry under the entry's key. */
export type ErrorCatalog<Entries extends Record<string, string | ErrorEntry>> = {
    readonly [Key in keyof Entries]: ErrorClass<MessageOf<Entries[Key]>, BaseOf<Entries[Key]>>;
};

const PLACEHOLDER = /\{(\w+)\}/g;

/** `CannotAddToFinishedBlock` or `native-network` as `CANNOT_ADD_TO_FINISHED_BLOCK` or `NATIVE_NETWORK`. */
export const constantCase = (name: string) =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toUpperCase();

/** The anchor the error reference gives a code's heading, as VitePress slugs it. */
export const codeAnchor = (code: string) => code.toLowerCase().replaceAll('_', '-');

/** The address of a code's entry in the error reference. */
export const docsUrlOf = (domain: string, code: string) => `${DOCS_URL}errors/${domain}#${codeAnchor(code)}`;

/** Fills a template's placeholders the way a template literal would. */
export const formatMessage = (template: string, params: Readonly<Record<string, unknown>>) =>
    template.replace(PLACEHOLDER, (_, name: string) => String(params[name]));

/**
 * Turns a catalog of message templates into error classes, one per entry. The domain names the
 * catalog's page in the error reference and prefixes every code, so the `DatabaseLocked` entry of
 * the `leveldb` domain has the code `LEVELDB_DATABASE_LOCKED`.
 *
 * @example
 * export const LeveldbErrors = defineErrors('leveldb', {
 *     DatabaseLocked: { message: 'The world at {path} is already open.', base: DatabaseLockedError }
 * });
 * throw new LeveldbErrors.DatabaseLocked({ path: directory }, { cause });
 */
export function defineErrors<const Entries extends Record<string, string | ErrorEntry>>(
    domain: string,
    entries: Entries
): ErrorCatalog<Entries> {
    const classes: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(entries)) {
        const { message: template, base = Error } = typeof entry === 'string' ? { message: entry } : entry;
        const code = `${constantCase(domain)}_${constantCase(key)}`;
        const docs = docsUrlOf(domain, code);
        // Without placeholders the first argument is the options, so the class reads it as such.
        const takesParams = new RegExp(PLACEHOLDER.source).test(template);

        // `base` may be abstract, such as a category; only its concrete subclass here is ever built.
        const Concrete = base as new (message?: string, options?: ErrorOptions) => Error;
        const Defined = class extends Concrete {
            public static readonly code = code;
            public static readonly domain = domain;
            public static readonly template = template;
            public static readonly docs = docs;

            public readonly code = code;
            public readonly docs = docs;
            declare public readonly params: Readonly<Record<string, unknown>>;

            // `ErrorCatalog` gives each class the arguments its template takes, which this one body serves.
            public constructor(...args: unknown[]) {
                const params = (takesParams ? args[0] : undefined) ?? {};
                const options = takesParams ? args[1] : args[0];
                super(formatMessage(template, params as Record<string, unknown>), options as ErrorOptions);
                // Kept for categories that expose a placeholder as a field, but out of `util.inspect`,
                // which prints the code and the docs link beside the stack.
                Object.defineProperty(this, 'params', { value: params });
                Object.defineProperty(this, cataloged, { value: true });
            }
        };
        Object.defineProperty(Defined, 'name', { value: key });
        classes[key] = Defined;
    }
    // The classes are built from `entries` one by one, which the mapped type cannot follow.
    return Object.freeze(classes) as ErrorCatalog<Entries>;
}
