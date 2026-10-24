import type { CompiledMolang } from './compiler';
import { compileProgram } from './compiler';
import { MolangSyntaxError } from './lexer';
import { parse } from './parser';
import { QueryRegistry } from './queries';
import type { EngineVersion } from './version';
import { LATEST_RULES, rulesForEngineVersion } from './version';

/** Options for one compilation. */
export interface CompileOptions {
    /**
     * The `min_engine_version` of the pack that contains the expression. Selects the versioned
     * precedence and evaluation rules; the latest rules apply when omitted.
     */
    minEngineVersion?: EngineVersion;
}

/** Options for a `Molang` engine. */
export interface MolangOptions {
    /** The query registry to bind `query.*` names against; a fresh vanilla registry by default. */
    queries?: QueryRegistry;
}

/**
 * Compiles Molang expressions to closures, once per (source text, version), and caches the result.
 * Source that fails to parse compiles to a constant 0 with a `syntax-error` diagnostic, matching
 * the engine's content-error behavior.
 */
export class Molang {
    /** The registry this engine binds `query.*` names against. */
    public readonly queries: QueryRegistry;

    private readonly cache = new Map<string, CompiledMolang>();

    public constructor(options: MolangOptions = {}) {
        this.queries = options.queries ?? new QueryRegistry();
    }

    /** Compiles an expression, reusing the cached result for the same (source, version) pair. */
    public compile(source: string, options: CompileOptions = {}): CompiledMolang {
        const version = options.minEngineVersion;
        const key = `${version ? version.join('.') : 'latest'}\u0000${source}`;
        const cached = this.cache.get(key);
        if (cached) return cached;
        const rules = version ? rulesForEngineVersion(version) : LATEST_RULES;
        let compiled: CompiledMolang;
        try {
            compiled = compileProgram(source, parse(source, rules), rules, this.queries);
        } catch (error) {
            if (!(error instanceof MolangSyntaxError)) throw error;
            compiled = {
                source,
                diagnostics: [{ code: 'syntax-error', message: error.message }],
                evaluate: () => 0
            };
        }
        this.cache.set(key, compiled);
        return compiled;
    }
}
