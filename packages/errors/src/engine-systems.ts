import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/engine-systems` throws. */
export const EngineSystemsErrors = defineErrors('engine-systems', {
    /**
     * A saved random tick state is not a signed 32-bit integer, so the save or the replay that
     * holds it is damaged.
     */
    InvalidRandomTickState: { message: 'Random tick state must be a signed 32-bit integer', base: RangeError }
});
