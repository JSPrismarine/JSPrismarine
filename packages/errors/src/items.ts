import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** Error thrown when a provider definition is missing or has a node kind this module does not know. */
export abstract class NumberProviderError extends JSPrismarineError {
    public override name = 'NumberProviderError';
}

/** The errors `@jsprismarine/items` throws. */
export const ItemsErrors = defineErrors('items', {
    /**
     * A number provider divides by a value that evaluated to zero. Fix the provider in the pack
     * that defines it.
     */
    DivProviderDividesByZero: { message: 'a div provider divides by zero', base: NumberProviderError },
    /**
     * A pack gave something that is neither a number nor a number provider object where a number
     * provider belongs.
     */
    IsNotNumberProvider: { message: '{node} is not a number provider', base: NumberProviderError },
    /** A pack names a context value that no number provider reads, such as a misspelled name. */
    NoContextProviderIsKnown: { message: 'no context provider is known as {node}', base: NumberProviderError },
    /** A number provider's `type` is one this server does not implement. */
    UnknownNumberProviderKind: { message: 'unknown number provider kind {type}', base: NumberProviderError },
    /** A weighted list number provider's weights add up to zero, so it cannot pick anything. */
    WeightedListProviderHasNoWeight: { message: 'a weighted list provider has no weight', base: NumberProviderError }
});
