import type { Definition } from './definitions';
import { ContentError } from './errors';
import type { HookSignatures } from './hooks';

/** What a {@link ComponentSchema} made of a JSON value. */
export type ParseResult<P> =
    { readonly ok: true; readonly value: P } | { readonly ok: false; readonly message: string };

/** Wraps a parsed value as a successful {@link ParseResult}. */
export const accepted = <P>(value: P): ParseResult<P> => ({ ok: true, value });

/**
 * Wraps a failure as a {@link ParseResult}.
 *
 * @param message - What the value should have been; the resolver puts it in a diagnostic.
 */
export const rejected = (message: string): ParseResult<never> => ({ ok: false, message });

/**
 * Validates and parses one component's JSON value, once per type at load.
 *
 * A schema is a plain function so a domain can inject whatever it already has:
 * a hand-written check, a Bedrock sample schema, or a `vanilla-mcdoc` checker.
 */
export type ComponentSchema<P> = (value: unknown) => ParseResult<P>;

/** Accepts any JSON value unchanged, for a component with no schema yet. */
export const anyValue: ComponentSchema<unknown> = (value) => accepted(value);

/** What a component factory can see about the type it binds to. */
export interface ComponentContext {
    /** The identifier of the type being resolved. */
    readonly identifier: string;
    /** The definition the component's value came from. */
    readonly definition: Definition;
}

/**
 * One documented component name bound to a schema and a set of hooks.
 *
 * A domain registers one factory per component name it implements. The server
 * fills the registry with the vanilla components and plugins add their own.
 */
export interface ComponentFactory<H extends HookSignatures<H>, P = unknown> {
    /** The component name as a definition writes it, such as `minecraft:destructible_by_mining`. */
    readonly name: string;
    /**
     * Every hook the component may implement. This is an upper bound: the
     * parsed parameters may leave one out, and returning a hook that is not on
     * the list is a registration error. Domains read the list to decide which
     * types can ever reach a hook.
     */
    readonly hooks: readonly (keyof H & string)[];
    /** Runs once per type at load, before {@link ComponentFactory.create}. */
    readonly schema: ComponentSchema<P>;
    /** Turns parsed parameters into the handlers this component contributes. */
    create(params: P, context: ComponentContext): Partial<H>;
}

/** One component after its value parsed and its handlers bound. */
export interface BoundComponent<H extends HookSignatures<H>> {
    /** The component name, which is also its key in the definition. */
    readonly name: string;
    /**
     * What the factory's schema produced. The parameter type is erased here;
     * read it back through the resolved type, which narrows it against the
     * factory that produced it.
     */
    readonly params: unknown;
    /** The handlers the factory returned. */
    readonly handlers: Partial<H>;
}

/** A factory with its parameter type erased, which is how the registry stores one. */
interface ErasedFactory<H extends HookSignatures<H>> {
    readonly hooks: ReadonlySet<string>;
    bind(value: unknown, context: ComponentContext): ParseResult<BoundComponent<H>>;
}

/**
 * The component names one domain implements, each bound to a schema and a
 * factory.
 *
 * Resolution goes through {@link ComponentRegistry.bind}, which parses the
 * value and builds the handlers in one step so the parameter type never
 * escapes the factory that declared it.
 */
export class ComponentRegistry<H extends HookSignatures<H>> {
    private readonly factories = new Map<string, ErasedFactory<H>>();

    /**
     * Adds one component name.
     *
     * @throws {ContentError} When the name is already registered.
     */
    public register<P>(factory: ComponentFactory<H, P>): void {
        if (this.factories.has(factory.name)) {
            throw new ContentError(`the component ${factory.name} is already registered`);
        }

        const hooks = new Set<string>(factory.hooks);
        this.factories.set(factory.name, {
            hooks,
            bind: (value, context) => {
                const parsed = factory.schema(value);
                if (!parsed.ok) return parsed;

                const handlers = factory.create(parsed.value, context);
                for (const hook of Object.keys(handlers)) {
                    if (hooks.has(hook)) continue;
                    throw new ContentError(
                        `the component ${factory.name} returned a handler for ${hook}, which it does not declare`
                    );
                }
                return accepted({ name: factory.name, params: parsed.value, handlers });
            }
        });
    }

    /** Whether a factory is registered under the name. */
    public has(name: string): boolean {
        return this.factories.has(name);
    }

    /** Every hook a component may implement, empty when the name is unknown. */
    public hooksOf(name: string): ReadonlySet<string> {
        return this.factories.get(name)?.hooks ?? new Set();
    }

    /** Every registered component name, in registration order. */
    public names(): readonly string[] {
        return [...this.factories.keys()];
    }

    /**
     * Parses one component's value and binds its handlers.
     *
     * @returns The bound component, or the schema's message when the value
     *   does not parse, or a message naming the component when nothing is
     *   registered under it.
     * @throws {ContentError} When the factory returns a hook it does not declare.
     */
    public bind(name: string, value: unknown, context: ComponentContext): ParseResult<BoundComponent<H>> {
        const factory = this.factories.get(name);
        if (!factory) return rejected(`no component is registered as ${name}`);
        return factory.bind(value, context);
    }
}
