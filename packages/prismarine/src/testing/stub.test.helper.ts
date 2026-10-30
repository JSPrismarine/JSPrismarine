/**
 * The members a test may hand to {@link stub} or {@link stubOf}, or assign over a real instance.
 *
 * A class type that includes `constructor` makes plain `Partial<T>` unsatisfiable by an object
 * literal, since the literal's `constructor` is `Function`. Dropping that one key leaves the
 * public shape.
 */
export type StubMembers<T extends object> = Partial<Omit<T, 'constructor'>>;

/**
 * Builds a test double typed as `T` from a subset of its members.
 *
 * Tests stand partial objects in for classes such as `Server` or `World`, whose private fields
 * keep an object literal from satisfying the class type. This is the one place that boundary is
 * crossed: `Object.create` returns `any`, so the double takes the full type without an `as`
 * assertion at each call site, while `Partial<T>` still checks every member a test provides.
 * The declared `constructor` field some classes carry is left out, since a plain object cannot
 * supply it.
 *
 * @param members - Members the test needs. Anything else is absent on the double.
 */
export const stub = <T extends object>(members: StubMembers<T> = {}): T => {
    return Object.assign(Object.create(Object.prototype), members);
};

/**
 * Builds a test double that also passes `instanceof` checks for `constructor`.
 *
 * @param constructor - Class whose prototype the double inherits.
 * @param members - Members the test needs on top of the inherited prototype.
 */
export const stubOf = <T extends object>(
    constructor: abstract new (...args: never[]) => T,
    members: StubMembers<T> = {}
): T => {
    return Object.assign(Object.create(constructor.prototype), members);
};
