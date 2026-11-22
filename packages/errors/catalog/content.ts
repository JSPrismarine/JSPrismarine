import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';

/**
 * Every failure this package raises. A content failure is a load-time
 * programming or data error, never a condition a tick loop recovers from, so
 * the runtime fails the load instead of returning a sentinel.
 */
export abstract class ContentError extends JSPrismarineError {
    public override name = 'ContentError';
}

/** Error thrown when a table cannot be flattened. */
export abstract class FlattenError extends ContentError {
    public override name = 'FlattenError';
}

/** The errors `@jsprismarine/content` throws. */
export const ContentErrors = defineErrors('content', {
    /** Two behaviors were registered under the same name. */
    BehaviorIsAlreadyRegistered: { message: 'the behavior {name} is already registered', base: ContentError },
    /**
     * A behavior returned a handler for a hook it did not list among its hooks. Add the hook to its
     * declaration.
     */
    BehaviorUndeclaredHook: {
        message: 'the behavior {name} returned a handler for {hook}, which it does not declare',
        base: ContentError
    },
    /**
     * A content table's value does not fit the integer type of its column. The data is wrong, or
     * the column needs a wider type.
     */
    ColumnValueOutOfRange: {
        message: 'column {column} got {value} at id {id}, outside the {kind} range {min} to {max}',
        base: FlattenError
    },
    /**
     * A content table's value cannot be stored in its column's typed array, such as a non-number in
     * a numeric column.
     */
    ColumnValueUnstorable: {
        message: 'column {column} got {value} at id {id}, which a {kind} array cannot hold',
        base: FlattenError
    },
    /** A content table's value has a fraction, and its integer column would drop it. */
    ColumnValueTruncated: {
        message: 'column {column} got {value} at id {id}, which a {kind} array would truncate',
        base: FlattenError
    },
    /** Two components were registered under the same name. */
    ComponentIsAlreadyRegistered: { message: 'the component {name} is already registered', base: ContentError },
    /**
     * A component returned a handler for a hook it did not list among its hooks. Add the hook to
     * its declaration.
     */
    ComponentUndeclaredHook: {
        message: 'the component {name} returned a handler for {hook}, which it does not declare',
        base: ContentError
    },
    /** A behavior was attached by a name nothing registered. */
    NoBehaviorIsRegistered: { message: 'no behavior is registered as {behaviorName}', base: ContentError },
    /**
     * Some entries of a content table have no value for a column and no reviewed exception that
     * explains why. Supply the values, or record the gaps as reviewed exceptions.
     */
    MissingColumnValues: {
        message: 'no value and no reviewed exception for {shown}{rest}',
        base: FlattenError
    },
    /**
     * A content registry was given the same key twice while it was built, such as two packs
     * defining one identifier in the same layer.
     */
    DuplicateRegistryKey: { message: 'the {name} registry got {key} twice in one build', base: ContentError },
    /**
     * A content registry was asked for a key nothing defines, such as an identifier no loaded pack
     * declares.
     */
    RegistryHasNoEntry: { message: 'the {name} registry has no entry for {key}', base: ContentError },
    /**
     * A content table lists reviewed exceptions for entries that now have values. Remove the stale
     * exceptions.
     */
    StaleReviewedExceptions: {
        message: 'reviewed exceptions matched nothing and should be removed: {shown}',
        base: FlattenError
    },
    /** A content source asked for a numeric id outside the table. */
    SourceIdOutOfRange: {
        message: 'a source claims id {id}, outside the 0 to {value} range',
        base: FlattenError
    },
    /** Two content sources asked for the same numeric id. */
    DuplicateSourceId: { message: 'two sources claim id {id}', base: FlattenError },
    /**
     * A strict content load found problems. The error's `diagnostics` list every one, and the
     * message shows the first.
     */
    ContentDidNotResolveCleanly: {
        message: 'the content did not resolve cleanly: {count} diagnostic(s), first: {first}',
        base: ContentError
    }
});
