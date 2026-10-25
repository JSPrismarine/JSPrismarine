import type { BehaviorRegistry, BoundBehavior } from './behaviors';
import type { BindContext, BoundComponent, ComponentFactory, ComponentRegistry } from './components';
import type { Definition } from './definitions';
import type { Diagnostic } from './diagnostics';
import { ContentError } from './errors';
import type { HookContribution, HookSignatures } from './hooks';
import { HookTable } from './hooks';

/** One component a definition declares, as the domain's reader found it. */
export interface ComponentEntry {
    /** The component name, which must match a registered factory. */
    name: string;
    /** The component's raw JSON value, passed to the factory's schema. */
    value: unknown;
    /**
     * Replace the handlers every earlier entry bound for the hooks this one
     * implements. A block domain sets it for a permutation's component list,
     * which is how Bedrock's permutations override a base component.
     */
    override?: boolean;
}

/**
 * Reads the component list out of a definition's JSON, in declaration order.
 *
 * This is the seam that keeps the content runtime domain-neutral: the block,
 * item and entity packages each know their own wrapper key, their own
 * `component_groups` and their own permutation rules, and the runtime only
 * sees the flat list that comes out.
 */
export type ComponentReader = (definition: Definition) => Iterable<ComponentEntry>;

/** A resolved type before its flags are computed, which is what a flag computer reads. */
export interface TypeView<H extends HookSignatures<H>> {
    /** The identifier the type is registered under. */
    readonly identifier: string;
    /** The definition the type came from. */
    readonly definition: Definition;
    /** The components that bound, in declaration order; a rejected one is absent. */
    readonly components: readonly BoundComponent<H>[];
    /** The behaviors that attached, in attachment order. */
    readonly behaviors: readonly BoundBehavior<H>[];
    /** The dispatch table, built once here rather than per call. */
    readonly hooks: HookTable<H>;
    /**
     * The parsed parameters of one component, narrowed against the factory
     * whose schema produced them.
     *
     * @returns The parameters, or undefined when the type has no such component.
     */
    params<P>(factory: ComponentFactory<H, P>): P | undefined;
    /** Whether the type bound a component under the name. */
    hasComponent(name: string): boolean;
}

/**
 * The second of the three content layers: a definition resolved against the
 * component registries once at load, with components bound, behaviors
 * attached, the dispatch table built and the domain's flags computed.
 */
export interface Type<H extends HookSignatures<H>, F extends string = never> extends TypeView<H> {
    /** The flags the domain's {@link FlagSpec} computed, one pass at load. */
    readonly flags: Readonly<Record<F, boolean>>;
}

/** Computes one load-time flag from a resolved type. */
export type FlagComputer<H extends HookSignatures<H>> = (type: TypeView<H>) => boolean;

/**
 * The flags a domain computes once per type, such as whether a block is solid
 * or takes random ticks. Flattening a flag into a typed array is
 * {@link flatten}'s job; this is for the handful a type is asked for by name.
 */
export type FlagSpec<H extends HookSignatures<H>, F> = { readonly [K in keyof F]: FlagComputer<H> };

/** Options for {@link resolveTypes}. */
export interface ResolveOptions<H extends HookSignatures<H>, F extends object> {
    /** The component names the domain implements. */
    components: ComponentRegistry<H>;
    /** The behaviors the server and its plugins attach by identifier. */
    behaviors?: BehaviorRegistry<H>;
    /** Pulls the component list out of each definition. */
    read: ComponentReader;
    /**
     * The flags to compute per type. Written as a mapped type over `F` so a
     * spec passed inline both infers its own flag names and gives each
     * computer a typed {@link TypeView} parameter.
     */
    flags?: FlagSpec<H, F>;
    /** Fail the resolve when any diagnostic is reported, instead of reporting and continuing. */
    strict?: boolean;
}

/** What {@link resolveTypes} returns: the resolved types plus the full report. */
export interface ResolveResult<H extends HookSignatures<H>, F extends string> {
    /** Identifier to type, in definition order, ready for `Registry.rebuild`. */
    types: ReadonlyMap<string, Type<H, F>>;
    diagnostics: readonly Diagnostic[];
}

/** Error thrown by a strict resolve; `diagnostics` holds the full report. */
export class ContentLoadError extends ContentError {
    public override name = 'ContentLoadError';

    public constructor(public readonly diagnostics: readonly Diagnostic[]) {
        super(
            `the content did not resolve cleanly: ${diagnostics.length} diagnostic(s), first: ${diagnostics[0]?.message}`
        );
    }
}

/**
 * Resolves definitions into types.
 *
 * Each definition's components bind in declaration order, then the behaviors
 * attached to its identifier bind in attachment order, so the server's own
 * code has the last word over what a pack declared and a behavior marked
 * `override` can replace a component's handler. An unknown component name
 * loads the type anyway and is reported once per pack, naming the first file
 * that declared it, which turns "component not implemented" into a log line
 * instead of a missing class.
 *
 * @throws {ContentLoadError} In strict mode, when any diagnostic is reported.
 */
export const resolveTypes = <H extends HookSignatures<H>, F extends object = Record<never, never>>(
    definitions: Iterable<Definition>,
    options: ResolveOptions<H, F>
): ResolveResult<H, Extract<keyof F, string>> => {
    const diagnostics: Diagnostic[] = [];
    const seen = new Set<string>();
    const report = (diagnostic: Diagnostic): void => {
        const key = `${diagnostic.pack}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
        if (seen.has(key)) return;
        seen.add(key);
        diagnostics.push(diagnostic);
    };

    const types = new Map<string, Type<H, Extract<keyof F, string>>>();

    for (const definition of definitions) {
        const context: BindContext = { identifier: definition.identifier, definition };
        const components: BoundComponent<H>[] = [];
        const contributions: HookContribution<H>[] = [];

        for (const entry of options.read(definition)) {
            if (!options.components.has(entry.name)) {
                report({
                    severity: 'warning',
                    code: 'component.unknown',
                    pack: definition.pack,
                    path: definition.path,
                    message: `no component is registered as ${entry.name}`
                });
                continue;
            }

            const bound = options.components.bind(entry.name, entry.value, context);
            if (!bound.ok) {
                report({
                    severity: 'error',
                    code: 'component.invalid',
                    pack: definition.pack,
                    path: definition.path,
                    message: `${definition.identifier} component ${entry.name}: ${bound.message}`
                });
                continue;
            }

            components.push(bound.value);
            contributions.push({
                source: bound.value.name,
                handlers: bound.value.handlers,
                override: entry.override ?? false
            });
        }

        const behaviors = options.behaviors?.bind(context) ?? [];
        for (const behavior of behaviors) {
            contributions.push({
                source: behavior.name,
                handlers: behavior.handlers,
                override: behavior.override
            });
        }

        const names = new Set(components.map((component) => component.name));
        const view: TypeView<H> = {
            identifier: definition.identifier,
            definition,
            components,
            behaviors,
            hooks: new HookTable(contributions),
            params: <P>(factory: ComponentFactory<H, P>): P | undefined => {
                const found = components.find((component) => component.name === factory.name);
                // The parameters came out of this factory's own schema, so they are its parameter type.
                return found === undefined ? undefined : (found.params as P);
            },
            hasComponent: (name) => names.has(name)
        };

        // The spec is a mapped type over the caller's own flag names, which
        // TypeScript gives no index signature, so walking it by name needs the
        // erased shape; the keys come straight back out below.
        const spec = (options.flags ?? {}) as Readonly<Record<string, FlagComputer<H>>>;
        const flags: Record<string, boolean> = {};
        for (const [flag, compute] of Object.entries(spec)) flags[flag] = compute(view);

        // Walking the spec with Object.entries drops its key literals, so the
        // record carries exactly the spec's flags only by construction.
        const computed = flags as Readonly<Record<Extract<keyof F, string>, boolean>>;
        types.set(definition.identifier, { ...view, flags: computed });
    }

    if (options.strict && diagnostics.length > 0) throw new ContentLoadError(diagnostics);

    return { types, diagnostics };
};
