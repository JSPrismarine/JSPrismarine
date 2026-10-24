/**
 * The hook map a domain declares: hook name to handler signature. The content
 * runtime never names a hook, so the block, item and entity packages each
 * declare their own map and pass it as the `H` parameter.
 *
 * The parameter is self-referential (`H extends HookSignatures<H>`) so a domain
 * can declare its map as an `interface`. A plain index-signature constraint
 * would reject one, because TypeScript gives an implicit index signature to a
 * type alias and not to an interface.
 *
 * @example
 * ```typescript
 * interface BlockHooks {
 *     onPlace: (position: number) => void;
 *     onInteract: (player: string) => boolean | undefined;
 * }
 * ```
 */
export type HookSignatures<H> = { [K in keyof H]: (...args: never[]) => unknown };

/** A handler with its per-hook signature erased, which is how the table stores one. */
type Handler = (...args: never[]) => unknown;

/** One contributor's handlers, from a component or an attached behavior. */
export interface HookContribution<H extends HookSignatures<H>> {
    /** The component or behavior name, so diagnostics and dispatch order can name it. */
    readonly source: string;
    /** The handlers it implements. A hook it leaves out is simply absent. */
    readonly handlers: Partial<H>;
    /**
     * Replace every earlier handler for each hook this contribution implements
     * instead of running after them. This is Bedrock's permutation rule: a
     * permutation's component overrides the base component for the same hook
     * and leaves the hooks it does not implement alone.
     */
    readonly override?: boolean;
}

const EMPTY: readonly never[] = Object.freeze([]);

/**
 * Walks a hook map by name.
 *
 * A domain declares its hook map as an interface, which TypeScript gives no
 * index signature, so walking it by name means erasing the per-hook signatures
 * here and narrowing them again in {@link HookTable.handlers}. TypeScript
 * cannot relate a container's value type to its key, so this is the one place
 * the relation is asserted.
 */
const handlerEntries = <H extends HookSignatures<H>>(handlers: Partial<H>): [string, Handler | undefined][] =>
    Object.entries(handlers as Record<string, Handler | undefined>);

/**
 * The dispatch table one resolved type binds once at load.
 *
 * Every hook becomes a frozen array of handlers in contribution order, so a
 * call costs one map lookup and a loop with no allocation. A contribution
 * marked `override` clears the handlers collected so far for the hooks it
 * implements, which is how a permutation replaces a base component.
 */
export class HookTable<H extends HookSignatures<H>> {
    private readonly byHook = new Map<string, readonly Handler[]>();
    private readonly bySource = new Map<string, readonly string[]>();

    /** @param contributions - Components in declaration order, then behaviors in attachment order. */
    public constructor(contributions: Iterable<HookContribution<H>>) {
        const handlers = new Map<string, Handler[]>();
        const sources = new Map<string, string[]>();

        for (const contribution of contributions) {
            for (const [hook, handler] of handlerEntries(contribution.handlers)) {
                if (handler === undefined) continue;

                if (contribution.override || !handlers.has(hook)) {
                    handlers.set(hook, []);
                    sources.set(hook, []);
                }
                handlers.get(hook)!.push(handler);
                sources.get(hook)!.push(contribution.source);
            }
        }

        for (const [hook, list] of handlers) this.byHook.set(hook, Object.freeze(list));
        for (const [hook, list] of sources) this.bySource.set(hook, Object.freeze(list));
    }

    /** Whether anything implements the hook. */
    public has(hook: keyof H & string): boolean {
        return this.byHook.has(hook);
    }

    /** The handlers for one hook in dispatch order, frozen and empty when nothing implements it. */
    public handlers<K extends keyof H & string>(hook: K): readonly H[K][] {
        const stored = this.byHook.get(hook);
        // The key picks the signature; see handlerEntries for why the table erases it.
        return stored === undefined ? EMPTY : (stored as readonly H[K][]);
    }

    /** The component or behavior behind each handler, in the same order as {@link HookTable.handlers}. */
    public contributors(hook: keyof H & string): readonly string[] {
        return this.bySource.get(hook) ?? EMPTY;
    }

    /** Calls every handler for the hook in dispatch order, discarding their results. */
    public dispatch<K extends keyof H & string>(hook: K, ...args: Parameters<H[K]>): void {
        for (const handler of this.handlers(hook)) handler(...args);
    }

    /**
     * Calls handlers in dispatch order until one returns a value other than
     * undefined, which is how a cancelable hook reports that it handled the
     * event.
     *
     * @returns That handler's result, or undefined when every handler declines.
     */
    public dispatchFirst<K extends keyof H & string>(hook: K, ...args: Parameters<H[K]>): ReturnType<H[K]> | undefined {
        for (const handler of this.handlers(hook)) {
            const result = handler(...args);
            // The erased handler type returns unknown; the hook's own signature says what it is.
            if (result !== undefined) return result as ReturnType<H[K]>;
        }
        return undefined;
    }
}
