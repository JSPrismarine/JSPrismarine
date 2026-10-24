/**
 * A function file compiled once into the commands a call runs. A plain
 * function is instantiated for free, every call sharing the same lines. A
 * macro function re-instantiates per argument set, so it keeps a small cache
 * of recent sets, which is what makes repeated calls with the same arguments
 * cheaper than new ones.
 */

import type { Diagnostic } from './diagnostics';
import type { MacroArguments, MacroTemplate } from './macro';
import { compileMacroLine, substituteMacro } from './macro';
import { parseFunctionSource } from './parse';

/**
 * How many argument sets one macro function remembers. Java's
 * `MacroFunction` carries 8 as its only integer constant, and caches only the
 * values the macro actually references, so extra entries in the compound do
 * not split the cache.
 */
export const MACRO_CACHE_ENTRIES = 8;

/** One command a call is about to run. */
export interface InstantiatedCommand {
    /** The command text, with every macro substitution already filled in. */
    command: string;
    /** The 1-based line of the function file the command came from. */
    line: number;
}

/** The outcome of instantiating a function for one call. */
export type InstantiationResult =
    { ok: true; commands: readonly InstantiatedCommand[] } | { ok: false; message: string; line?: number };

/** One compiled line: fixed text, or a template waiting for arguments. */
type CompiledLine = { line: number; command: string } | { line: number; template: MacroTemplate };

/**
 * A function file ready to run. Instances come from {@link compileFunction}
 * and are shared by every call, including the macro cache.
 */
export class CompiledFunction {
    /** Whether any line of the function is a macro line, so calls need arguments. */
    public readonly macro: boolean;

    /** Every variable the function substitutes, once each, in first-use order. */
    public readonly variables: readonly string[];

    private readonly cache = new Map<string, readonly InstantiatedCommand[]>();

    private readonly plain: readonly InstantiatedCommand[] | undefined;

    public constructor(
        /** The namespaced id the function is registered under. */
        public readonly id: string,
        private readonly lines: readonly CompiledLine[]
    ) {
        this.macro = lines.some((line) => 'template' in line);
        const variables: string[] = [];
        for (const line of lines) {
            if (!('template' in line)) continue;
            for (const variable of line.template.variables) {
                if (!variables.includes(variable)) variables.push(variable);
            }
        }
        this.variables = variables;
        this.plain = this.macro
            ? undefined
            : lines.flatMap((line) => ('command' in line ? [{ command: line.command, line: line.line }] : []));
    }

    /** How many commands the function declares. */
    public get length(): number {
        return this.lines.length;
    }

    /**
     * Produces the commands one call runs.
     *
     * A plain function ignores the arguments, the way the Java server
     * silently ignores a compound passed to a non-macro function. A macro
     * function needs one entry per variable it substitutes and reports the
     * first entry it is missing; the Java server skips the whole call in that
     * case, and so does {@link FunctionExecutor}.
     */
    public instantiate(args?: MacroArguments): InstantiationResult {
        if (this.plain) return { ok: true, commands: this.plain };

        if (args === undefined) {
            return {
                ok: false,
                message: `${this.id} is a macro function and was called without arguments`
            };
        }

        for (const variable of this.variables) {
            const value = args[variable];
            if (value === undefined || value === null) {
                return { ok: false, message: `the macro arguments have no entry for '${variable}'` };
            }
        }

        const key = JSON.stringify(this.variables.map((variable) => args[variable] ?? null));
        const cached = this.cache.get(key);
        if (cached) {
            // Re-insert to make this the most recent set, so the eviction below
            // drops the set that has gone unused the longest.
            this.cache.delete(key);
            this.cache.set(key, cached);
            return { ok: true, commands: cached };
        }

        const commands: InstantiatedCommand[] = [];
        for (const line of this.lines) {
            if ('command' in line) {
                commands.push({ command: line.command, line: line.line });
                continue;
            }

            const substituted = substituteMacro(line.template, args);
            if (!substituted.ok) return { ok: false, message: substituted.message, line: line.line };
            commands.push({ command: substituted.command, line: line.line });
        }

        this.cache.set(key, commands);
        if (this.cache.size > MACRO_CACHE_ENTRIES) {
            const oldest = this.cache.keys().next();
            if (!oldest.done) this.cache.delete(oldest.value);
        }

        return { ok: true, commands };
    }

    /** How many argument sets the macro cache currently holds. */
    public get cachedArgumentSets(): number {
        return this.cache.size;
    }
}

/** What {@link compileFunction} produces. */
export interface CompileResult {
    /** The compiled function, or undefined when the file did not compile. */
    function?: CompiledFunction;
    diagnostics: readonly Diagnostic[];
}

/**
 * Compiles one function file.
 *
 * A file with any error does not produce a function, matching the Java
 * server, where a file that fails `CommandFunction.fromLines` is logged and
 * left out of the function library rather than partly loaded.
 *
 * @param id - The namespaced id the file loads under.
 * @param source - The text of the `.mcfunction` file.
 */
export const compileFunction = (id: string, source: string): CompileResult => {
    const parsed = parseFunctionSource(source);
    const diagnostics: Diagnostic[] = parsed.diagnostics.map((diagnostic) => ({ ...diagnostic, functionId: id }));
    const lines: CompiledLine[] = [];

    for (const line of parsed.lines) {
        if (!line.macro) {
            lines.push({ line: line.line, command: line.command });
            continue;
        }

        const compiled = compileMacroLine(line.command);
        if (!compiled.ok) {
            diagnostics.push({
                severity: 'error',
                code: 'macro.invalid',
                functionId: id,
                line: line.line,
                message: compiled.message
            });
            continue;
        }

        lines.push({ line: line.line, template: compiled.template });
    }

    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { diagnostics };
    return { function: new CompiledFunction(id, lines), diagnostics };
};
