import type { EntityInstance } from '@jsprismarine/entities';
import type { GoalWorld } from '@jsprismarine/entity-goals';

import type { ServerWorldAdapter, ServerWorldSource } from './adapter';

/** A world source whose captured adapters can be redirected after a startup snapshot restores. */
export interface RebindableServerWorldSource {
    /** Stable source passed to content builders; its adapters resolve against the latest binding. */
    readonly source: ServerWorldSource;
    /** Redirects existing world views to a new server world. */
    bind(source: ServerWorldSource): void;
}

/**
 * Creates a stable world-source facade whose adapters follow the currently bound server world.
 *
 * Content behavior closures capture adapter objects while registries are built. The forwarding
 * proxies keep those closures intact in a V8 snapshot while routing later calls to the live world.
 */
export const createRebindableServerWorldSource = (initial: ServerWorldSource): RebindableServerWorldSource => {
    let current = initial;
    const adapters = new Map<string, ServerWorldAdapter>();

    const forward = <T extends object>(resolve: () => T): T =>
        // The proxy target is never observed; its shape comes from resolve() at each access.
        new Proxy(Object.create(null) as T, {
            get(_target, property) {
                const owner = resolve();
                const value: unknown = Reflect.get(owner, property, owner);
                if (typeof value === 'function') {
                    return (...args: unknown[]) => Reflect.apply(value, owner, args);
                }
                if (typeof value === 'object' && value !== null) {
                    return forward(() => {
                        const nextOwner = resolve();
                        const nextValue: unknown = Reflect.get(nextOwner, property, nextOwner);
                        if (typeof nextValue !== 'object' || nextValue === null) {
                            throw new TypeError(`World source member ${String(property)} changed from an object`);
                        }
                        return nextValue;
                    });
                }
                return value;
            }
        });

    const source: ServerWorldSource = {
        at(dimension) {
            let adapter = adapters.get(dimension);
            if (adapter === undefined) {
                adapter = forward(() => current.at(dimension));
                adapters.set(dimension, adapter);
            }
            return adapter;
        },
        get goalWorld(): ((entity: EntityInstance) => GoalWorld | undefined) | undefined {
            if (current.goalWorld === undefined) return undefined;
            return (entity) => current.goalWorld?.(entity);
        }
    };

    return {
        source,
        bind(next) {
            current = next;
        }
    };
};
