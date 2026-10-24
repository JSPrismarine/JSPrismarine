import type { PredicateContext } from './context';
import { DiagnosticCollector } from './diagnostics';
import type { Diagnostic } from './diagnostics';
import type { ItemStack } from './item';
import { joinPath } from './json';
import type { ReferenceResolver } from './reference';
import type { EntityView } from './world';

/**
 * Compiles one member of a sub-grammar keyed by type id. The returned matcher
 * answers for one subject against a context.
 */
export type SubPredicateParser<TSubject> = (
    value: unknown,
    context: ParseContext
) => (subject: TSubject, evaluation: PredicateContext) => boolean;

/**
 * The registry seam. Entries here are merged over the built-in tables, so a
 * host can teach the evaluator a sub-predicate this package does not
 * implement without forking it.
 */
export interface GrammarExtensions {
    /** Extra entity sub-predicate types, keyed by namespaced id such as `minecraft:type_specific/axolotl`. */
    readonly entitySubPredicates?: Readonly<Record<string, SubPredicateParser<EntityView>>>;
    /** Extra data component predicate types, keyed by namespaced id. */
    readonly dataComponentPredicates?: Readonly<Record<string, SubPredicateParser<ItemStack>>>;
}

/** Everything the parsers can be told about the world they are parsing into. */
export interface ParseOptions {
    /** Resolves namespaced ids and `#tag` references; without it a reference reports an error. */
    resolver?: ReferenceResolver;
    /** Reuse a collector to gather diagnostics from several parses into one report. */
    diagnostics?: DiagnosticCollector;
    /** Prefix for diagnostic paths, such as the file the JSON came from. */
    path?: string;
    extensions?: GrammarExtensions;
}

/** A compiled grammar member together with everything that went wrong while compiling it. */
export interface ParseResult<T> {
    readonly value: T;
    readonly diagnostics: readonly Diagnostic[];
}

/**
 * The parse-time state threaded through the grammar: where in the JSON we are,
 * where diagnostics go, how references resolve, and which references are
 * already on the stack so a cycle reports instead of recursing forever.
 */
export class ParseContext {
    public readonly path: string;
    public readonly diagnostics: DiagnosticCollector;
    public readonly resolver: ReferenceResolver | undefined;
    public readonly extensions: GrammarExtensions;
    /** Reference keys currently being expanded, shared by every context in one parse. */
    public readonly visiting: Set<string>;

    public constructor(
        path: string,
        diagnostics: DiagnosticCollector,
        resolver: ReferenceResolver | undefined,
        extensions: GrammarExtensions = {},
        visiting: Set<string> = new Set()
    ) {
        this.path = path;
        this.diagnostics = diagnostics;
        this.resolver = resolver;
        this.extensions = extensions;
        this.visiting = visiting;
    }

    /** Returns a context pointing at a member or array element of the current value. */
    public at(segment: string | number): ParseContext {
        return new ParseContext(
            joinPath(this.path, segment),
            this.diagnostics,
            this.resolver,
            this.extensions,
            this.visiting
        );
    }

    /** Returns a context whose path names a resolved reference rather than a JSON member. */
    public atReference(id: string): ParseContext {
        return new ParseContext(id, this.diagnostics, this.resolver, this.extensions, this.visiting);
    }

    /** Records a fault at the current path. */
    public error(message: string): void {
        this.diagnostics.error(this.path, message);
    }

    /** Records a recovered fault at the current path, such as a grammar member this package does not implement. */
    public warn(message: string): void {
        this.diagnostics.warn(this.path, message);
    }
}

/** Builds the root parse context from caller options. */
export const rootContext = (options: ParseOptions = {}): ParseContext =>
    new ParseContext(
        options.path ?? '',
        options.diagnostics ?? new DiagnosticCollector(),
        options.resolver,
        options.extensions
    );
