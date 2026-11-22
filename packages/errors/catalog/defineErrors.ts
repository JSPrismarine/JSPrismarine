import type { CatalogedError } from '@jsprismarine/errors/JSPrismarineError';

/**
 * A class a catalog entry may extend: `Error`, `TypeError`, `RangeError`, `ReferenceError`, or a
 * category that extends one of the catalog roots in `src/JSPrismarineError.ts`.
 */
export type ErrorBase =
    | ErrorConstructor
    | TypeErrorConstructor
    | RangeErrorConstructor
    | ReferenceErrorConstructor
    | (abstract new (message?: string, options?: ErrorOptions) => CatalogedError);

/** A catalog entry: its message template, and optionally the class it extends. */
export interface ErrorEntry {
    /** The message, with `{name}` placeholders the throw site fills in. A name uses only letters, digits and `_`. */
    readonly message: string;
    /** The class the error extends. Defaults to `Error`. */
    readonly base?: ErrorBase;
}

/** The message template of a catalog entry, written as a bare string or as an {@link ErrorEntry}. */
type MessageOf<Entry> = Entry extends string ? Entry : Entry extends ErrorEntry ? Entry['message'] : never;

/** The class a catalog entry extends: its `base`, or `Error` when it names none. */
type BaseOf<Entry> = Entry extends { readonly base: infer Base extends ErrorBase } ? Base : ErrorConstructor;

/** The placeholder names in a message template, such as `'file' | 'reason'` for `'{file}: {reason}'`. */
type Placeholders<Message extends string> = Message extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

/** The values a throw site passes for a template's placeholders. */
type ErrorParams<Message extends string> = { readonly [Name in Placeholders<Message>]: unknown };

/** The constructor arguments of an error: its placeholder values when it has any, then `{ cause }`. */
type ErrorArgs<Message extends string> = [Placeholders<Message>] extends [never]
    ? [options?: ErrorOptions]
    : [params: ErrorParams<Message>, options?: ErrorOptions];

/** An error a catalog entry becomes: its base, with the catalog's fields. */
type ErrorInstance<Message extends string, Base extends ErrorBase> = InstanceType<Base> &
    CatalogedError & { readonly code: string; readonly params: ErrorParams<Message> };

/** The class a catalog entry becomes, with the statics the generated class has. */
interface ErrorClass<Message extends string, Base extends ErrorBase> {
    new (...args: ErrorArgs<Message>): ErrorInstance<Message, Base>;
    readonly prototype: ErrorInstance<Message, Base>;
    readonly code: string;
    readonly domain: string;
    readonly template: Message;
    readonly docs: string;
}

/** The catalog object a generated module exports, one class per entry under the entry's key. */
export type ErrorCatalog<Entries extends Record<string, string | ErrorEntry>> = {
    readonly [Key in keyof Entries]: ErrorClass<MessageOf<Entries[Key]>, BaseOf<Entries[Key]>>;
};

/**
 * Declares a catalog of errors, one per entry. `scripts/generate-error-classes.mts` reads the call
 * from the source text and writes a class per entry into the module of the same path under `src/`,
 * which is what the package publishes. Nothing imports a catalog at run time, so this function has
 * no body: its type lets the compiler check each entry, and lets other code in the catalog, such as
 * `asError` in `common.ts`, use the classes as the generated module will have them.
 *
 * The domain names the catalog's page in the error reference and prefixes every code, so the
 * `DatabaseLocked` entry of the `leveldb` domain has the code `LEVELDB_DATABASE_LOCKED`. A domain
 * split across catalog modules, such as `catalog/prismarine/`, names the module after a slash, as
 * in `defineErrors('prismarine/world', { ... })`.
 *
 * @example
 * export const LeveldbErrors = defineErrors('leveldb', {
 *     DatabaseLocked: { message: 'The world at {path} is already open.', base: DatabaseLockedError }
 * });
 */
export declare function defineErrors<const Entries extends Record<string, string | ErrorEntry>>(
    catalog: string,
    entries: Entries
): ErrorCatalog<Entries>;
