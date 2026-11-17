import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/block-behaviors` throws. */
export const BlockBehaviorsErrors = defineErrors('block-behaviors', {
    /**
     * The `jsprismarine:block_properties` component's schema refused the defaults it is built with.
     * This is a bug in `@jsprismarine/block-behaviors`; report it with the message.
     */
    BlockPropertiesDefaultsRejected: 'the block properties schema rejected its own defaults: {message}'
});
