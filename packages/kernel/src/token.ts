declare const serviceType: unique symbol;

/**
 * A typed key into the kernel's service registry.
 *
 * The id is a namespaced string such as `prismarine:worlds`; two tokens with the
 * same id name the same service. The phantom marker ties the service interface
 * to the token at compile time only and never exists at runtime.
 */
export interface ServiceToken<T> {
    /** Namespaced identifier in `namespace:name` form, e.g. `prismarine:worlds`. */
    readonly id: string;
    /** Compile-time marker carrying the service type. Never set at runtime. */
    readonly [serviceType]?: T;
}

/**
 * Creates a service token for the given namespaced id.
 *
 * @param id - Namespaced identifier in `namespace:name` form.
 * @throws Error when the id is not of the form `namespace:name` with both parts non-empty.
 */
export function createToken<T>(id: string): ServiceToken<T> {
    const separator = id.indexOf(':');
    if (separator <= 0 || separator === id.length - 1) {
        throw new Error(`Service token id must be namespaced as "namespace:name", got "${id}"`);
    }
    return { id };
}
