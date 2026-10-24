import type { HookSignatures } from './hooks';
import type { Holder } from './registry';
import type { Type } from './types';

/**
 * The third of the three content layers: one live thing of a type, holding a
 * reference to that type and nothing else but its own state.
 *
 * An instance is an item stack or an entity. A block in chunk storage is not
 * one: it is a runtime id, and the hot path reads a flattened array rather
 * than building a handle per block.
 *
 * The type reference is a {@link Holder}, so reloading content points every
 * live instance at the new type without walking the world. An instance whose
 * identifier the reload dropped reports that instead of ticking a stale type.
 */
export class Instance<H extends HookSignatures<H>, S = undefined, F extends string = never> {
    /**
     * @param holder - A holder from the registry of resolved types.
     * @param state - Whatever the domain keeps per instance, such as an item count.
     */
    public constructor(
        public readonly holder: Holder<Type<H, F>>,
        public state: S
    ) {}

    /**
     * The type this instance is an instance of.
     *
     * @throws {ContentError} When the current content has no type under the holder's key.
     */
    public get type(): Type<H, F> {
        return this.holder.value();
    }

    /**
     * Calls every handler the type binds for the hook, in dispatch order.
     *
     * @throws {ContentError} When the current content has no type under the holder's key.
     */
    public dispatch<K extends keyof H & string>(hook: K, ...args: Parameters<H[K]>): void {
        this.type.hooks.dispatch(hook, ...args);
    }

    /**
     * Calls handlers in dispatch order until one returns a value other than undefined.
     *
     * @returns That handler's result, or undefined when every handler declines.
     * @throws {ContentError} When the current content has no type under the holder's key.
     */
    public dispatchFirst<K extends keyof H & string>(hook: K, ...args: Parameters<H[K]>): ReturnType<H[K]> | undefined {
        return this.type.hooks.dispatchFirst(hook, ...args);
    }
}
