/**
 * Loading functions and function tags from a stack of packs. The stack
 * composes the way the rest of this repository composes packs: a later pack
 * replaces an earlier one by identifier. Tags are the exception, because a tag
 * merges across packs unless it says `replace`, which is what lets two packs
 * both add to `minecraft:tick`.
 */

import type { CompiledFunction } from './compile';
import { compileFunction } from './compile';
import type { Diagnostic } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { FunctionLookup } from './executor';
import { functionIdForPath, functionTagIdForPath } from './identifiers';
import type { FunctionTag, FunctionTagEntry } from './tags';
import { FunctionTagRegistry } from './tags';

/**
 * One pack's files, keyed by pack-relative path. Any pack reader can supply
 * this: `@jsprismarine/packs` routes the JSON half of a datapack, and the
 * `.mcfunction` files it does not consume come through here unchanged.
 */
export interface FunctionPack {
    /** The pack's name, used to attribute diagnostics and to say which pack won. */
    name: string;
    files: ReadonlyMap<string, string | Uint8Array>;
}

/** The functions a pack stack loaded, keyed by namespaced id. */
export class FunctionRegistry implements FunctionLookup {
    private readonly functions = new Map<string, { compiled: CompiledFunction; pack: string }>();

    /** Registers a function, replacing whatever an earlier pack registered under the same id. */
    public add(compiled: CompiledFunction, pack: string): void {
        this.functions.set(compiled.id, { compiled, pack });
    }

    /** Returns the winning function for an id. */
    public get(id: string): CompiledFunction | undefined {
        return this.functions.get(id)?.compiled;
    }

    /** Whether any pack registered the id. */
    public has(id: string): boolean {
        return this.functions.has(id);
    }

    /** The name of the pack whose file won the id. */
    public packOf(id: string): string | undefined {
        return this.functions.get(id)?.pack;
    }

    /** Every registered id, in registration order. */
    public ids(): readonly string[] {
        return [...this.functions.keys()];
    }

    /** How many functions are registered. */
    public get size(): number {
        return this.functions.size;
    }
}

/** What {@link loadFunctions} produces. */
export interface FunctionLoadResult {
    functions: FunctionRegistry;
    tags: FunctionTagRegistry;
    diagnostics: readonly Diagnostic[];
}

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Decodes a file, or reports that it is not text. */
const decode = (
    file: string | Uint8Array,
    pack: string,
    path: string,
    collector: DiagnosticCollector
): string | undefined => {
    if (typeof file === 'string') return file;
    try {
        return decoder.decode(file);
    } catch {
        collector.add({
            severity: 'error',
            code: 'load.invalid-file',
            pack,
            message: `${path} is not valid UTF-8`
        });
        return undefined;
    }
};

/** Reads a function tag file, which is a JSON object with `values` and an optional `replace`. */
const readTagFile = (
    text: string,
    pack: string,
    path: string,
    collector: DiagnosticCollector
): FunctionTag | undefined => {
    const report = (message: string): undefined => {
        collector.add({ severity: 'error', code: 'load.invalid-file', pack, message: `${path}: ${message}` });
        return undefined;
    };

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return report(error instanceof Error ? error.message : String(error));
    }

    // Pack data is a parsed-input boundary, so every field is narrowed rather than asserted.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return report('a tag file must be a JSON object');
    }
    if (!('values' in parsed) || !Array.isArray(parsed.values)) return report('the tag file has no values array');

    const values: FunctionTagEntry[] = [];
    for (const entry of parsed.values) {
        if (typeof entry === 'string') {
            values.push(entry);
            continue;
        }
        if (typeof entry === 'object' && entry !== null && 'id' in entry && typeof entry.id === 'string') {
            const required = 'required' in entry && typeof entry.required === 'boolean' ? entry.required : undefined;
            values.push(required === undefined ? { id: entry.id } : { id: entry.id, required });
            continue;
        }
        return report('a tag entry must be an id or an object with an id');
    }

    const replace = 'replace' in parsed && parsed.replace === true;
    return { values, replace };
};

/**
 * Loads every function and function tag a pack stack declares.
 *
 * Packs apply in order. A function id a later pack also declares is replaced
 * whole; a tag a later pack also declares is merged, unless that pack sets
 * `replace`. A file that does not compile is reported and left out, so one
 * broken function does not stop the rest of the stack from loading.
 */
export const loadFunctions = (packs: readonly FunctionPack[]): FunctionLoadResult => {
    const functions = new FunctionRegistry();
    const tags = new FunctionTagRegistry();
    const collector = new DiagnosticCollector();

    for (const pack of packs) {
        for (const [path, file] of pack.files) {
            const functionId = functionIdForPath(path);
            if (functionId !== undefined) {
                const text = decode(file, pack.name, path, collector);
                if (text === undefined) continue;

                const compiled = compileFunction(functionId, text);
                for (const diagnostic of compiled.diagnostics) collector.add({ ...diagnostic, pack: pack.name });
                if (compiled.function) functions.add(compiled.function, pack.name);
                continue;
            }

            const tagId = functionTagIdForPath(path);
            if (tagId === undefined) continue;

            const text = decode(file, pack.name, path, collector);
            if (text === undefined) continue;

            const tag = readTagFile(text, pack.name, path, collector);
            if (tag) tags.add(tagId, tag);
        }
    }

    return { functions, tags, diagnostics: collector.diagnostics };
};
