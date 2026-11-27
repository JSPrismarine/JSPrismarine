import type { CompiledMolang } from './compiler';
import { compileProgram } from './compiler';
import { parse } from './parser';
import { QueryRegistry } from './queries';
import type { EngineVersion, MolangVersion } from './version';
import { LATEST_MOLANG_VERSION, molangVersionFor, rulesForMolangVersion } from './version';
import { MolangSyntaxError } from '@jsprismarine/errors/molang';

/** Options for one compilation. */
export interface CompileOptions {
    /**
     * The `min_engine_version` of the pack that contains the expression. Selects the versioned
     * precedence and evaluation rules; the latest rules apply when neither this nor
     * {@link CompileOptions.version} is given.
     */
    minEngineVersion?: EngineVersion;
    /**
     * The Molang version itself, as a field that carries its own version states it, or as
     * `molangVersionFor` resolved it from a manifest. Wins over
     * {@link CompileOptions.minEngineVersion}.
     */
    version?: MolangVersion;
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

    /**
     * Compiles an expression, reusing the cached result for the same (source, version) pair. Two
     * engine versions with the same Molang version share one compilation.
     */
    public compile(source: string, options: CompileOptions = {}): CompiledMolang {
        const version =
            options.version ??
            (options.minEngineVersion === undefined
                ? LATEST_MOLANG_VERSION
                : molangVersionFor(options.minEngineVersion));
        const key = `${version}\u0000${source}`;
        const cached = this.cache.get(key);
        if (cached) return cached;
        const rules = rulesForMolangVersion(version);
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
