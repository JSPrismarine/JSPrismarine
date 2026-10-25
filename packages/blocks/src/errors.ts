import { ContentError } from '@jsprismarine/content';

/**
 * Thrown for a programming mistake against this package's interface: a state
 * name the block does not carry, a runtime id outside the palette, a palette
 * built with a duplicate identifier.
 *
 * Bad pack data is not an error. It comes back as a {@link Diagnostic} so one
 * broken file cannot stop a load, which is the rule `@jsprismarine/packs` and
 * `@jsprismarine/content` already follow.
 */
export class BlockError extends ContentError {
    public override name = 'BlockError';
}
