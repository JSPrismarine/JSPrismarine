/**
 * Freezes `value` and returns the same reference.
 *
 * `Object.freeze`'s return value has no shape an ahead-of-time compiler can see, so Bun's AOT
 * executable reads every property of an object that came out of it by name. Returning the
 * argument instead keeps the object literal's shape, and the object is frozen all the same.
 */
export const frozen = <T extends object>(value: T): T => {
    Object.freeze(value);
    return value;
};
