import type { BindContext } from './components';
import type { Definition } from './definitions';
import { ContentError } from './errors';
import type { HookSignatures } from './hooks';

/**
 * A named set of handlers attached to types by identifier instead of declared
 * in a definition.
 *
 * Behaviors carry the code a family of content shares, the way one door
 * behavior covers every door. Mojang's `minecraft:custom_components` key is
 * one way to name a behavior, not the binding mechanism, because Mojang marked
 * that hook deprecated while its version 2 still needs two experimental
 * toggles.
 */
export interface Behavior<H extends HookSignatures<H>> {
    /** The behavior's name, in the server's or a plugin's own namespace. */
    readonly name: string;
    /**
     * Every hook the behavior may implement. As with a component factory this
     * is an upper bound, and returning a hook that is not on the list is a
     * registration error.
     */
    readonly hooks: readonly (keyof H & string)[];
    /** Replace the handlers every earlier contribution bound for the hooks this one implements. */
    readonly override?: boolean;
    /** Builds the handlers for one type. Runs once per attached type at load. */
    create(context: BindContext): Partial<H>;
}

/**
 * Picks the type identifiers a behavior attaches to: one identifier, a list of
 * them, or a predicate. Predicates receive the identifier and its loaded
 * definition, which lets a domain select behavior from component data or
 * attach by tag through a closed-over {@link Tags} instance. The definition
 * argument is optional when a caller invokes the predicate directly; the
 * registry supplies it when matching.
 */
export type BehaviorSelector = string | readonly string[] | ((identifier: string, definition?: Definition) => boolean);

/** One behavior after its handlers are built for a type. */
export interface BoundBehavior<H extends HookSignatures<H>> {
    readonly name: string;
    readonly handlers: Partial<H>;
    /** Whether the behavior replaces earlier handlers for the hooks it implements. */
    readonly override: boolean;
}

const matches = (selector: BehaviorSelector, identifier: string, definition: Definition): boolean => {
    if (typeof selector === 'string') return selector === identifier;
    if (typeof selector === 'function') return selector(identifier, definition);
    return selector.includes(identifier);
};

/**
 * The behaviors a domain implements and the identifiers they attach to.
 *
 * Attachment order is the order {@link BehaviorRegistry.attach} ran, and that
 * is the order the handlers dispatch in. Attaching one behavior to the same
 * identifier twice binds it once, at its first position.
 */
export class BehaviorRegistry<H extends HookSignatures<H>> {
    private readonly behaviors = new Map<string, Behavior<H>>();
    private readonly attachments: { behavior: string; selector: BehaviorSelector }[] = [];

    /**
     * Adds one behavior.
     *
     * @throws {ContentError} When the name is already registered.
     */
    public register(behavior: Behavior<H>): void {
        if (this.behaviors.has(behavior.name)) {
            throw new ContentError(`the behavior ${behavior.name} is already registered`);
        }
        this.behaviors.set(behavior.name, behavior);
    }

    /**
     * Attaches a registered behavior to every type the selector matches.
     *
     * @throws {ContentError} When no behavior is registered under the name.
     */
    public attach(behaviorName: string, selector: BehaviorSelector): void {
        if (!this.behaviors.has(behaviorName)) {
            throw new ContentError(`no behavior is registered as ${behaviorName}`);
        }
        this.attachments.push({ behavior: behaviorName, selector });
    }

    /** Whether a behavior is registered under the name. */
    public has(name: string): boolean {
        return this.behaviors.has(name);
    }

    /** Every registered behavior name, in registration order. */
    public names(): readonly string[] {
        return [...this.behaviors.keys()];
    }

    /**
     * Builds the handlers every attached behavior contributes to one type, in
     * attachment order.
     *
     * @throws {ContentError} When a behavior returns a hook it does not declare.
     */
    public bind(context: BindContext): readonly BoundBehavior<H>[] {
        const bound: BoundBehavior<H>[] = [];
        const done = new Set<string>();

        for (const attachment of this.attachments) {
            if (done.has(attachment.behavior)) continue;
            if (!matches(attachment.selector, context.identifier, context.definition)) continue;
            done.add(attachment.behavior);

            const behavior = this.behaviors.get(attachment.behavior)!;
            const handlers = behavior.create(context);
            const declared = new Set<string>(behavior.hooks);
            for (const hook of Object.keys(handlers)) {
                if (declared.has(hook)) continue;
                throw new ContentError(
                    `the behavior ${behavior.name} returned a handler for ${hook}, which it does not declare`
                );
            }

            bound.push({ name: behavior.name, handlers, override: behavior.override ?? false });
        }

        return bound;
    }
}
