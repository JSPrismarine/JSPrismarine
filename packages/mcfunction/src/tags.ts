/**
 * Function tags, including the two the server looks up by name. Java's
 * `ServerFunctionManager` declares exactly two tag constants, `minecraft:tick`
 * and `minecraft:load`, and nothing else in the server reads a function tag
 * on its own. Every other tag is reached from a `function #namespace:tag`
 * line.
 *
 * Vanilla ships neither file: the 26.3 server jar has 883 tag files and none
 * of them tags the function registry. A pack supplies both.
 */

import type { Diagnostic } from './diagnostics';
import { normalizeIdentifier, parseFunctionReference } from './identifiers';

/** The tag whose functions run once after the packs load. */
export const LOAD_FUNCTION_TAG = 'minecraft:load';

/** The tag whose functions run on every server tick. */
export const TICK_FUNCTION_TAG = 'minecraft:tick';

/**
 * One entry of a tag file: a function id, a `#tag` reference, or the object
 * form, whose `required: false` lets a pack reference something that may not
 * be installed.
 */
export type FunctionTagEntry = string | { id: string; required?: boolean };

/** One tag file's contents after the packs that declare it are merged. */
export interface FunctionTag {
    values: readonly FunctionTagEntry[];
    /** Whether the tag discards what earlier packs contributed. */
    replace?: boolean;
}

/** Where {@link resolveFunctionTag} reads tags from. */
export interface FunctionTagLookup {
    /** Returns the tag registered under a namespaced id, without the `#`. */
    get(tagId: string): FunctionTag | undefined;
}

/** The functions a tag names, in the order they run, plus anything that did not resolve. */
export interface TagResolution {
    /** The function ids, each once, in tag order with nested tags expanded in place. */
    functions: readonly string[];
    /** Whether the tag itself exists. An empty tag that exists resolves to no functions. */
    exists: boolean;
    diagnostics: readonly Diagnostic[];
}

/**
 * Expands a function tag into the functions it names.
 *
 * Entries apply in order and a nested `#tag` expands where it appears. A
 * function already named earlier is not repeated. A cycle between tags is
 * reported and cut rather than followed, and a missing entry is reported only
 * when the entry does not say `required: false`.
 *
 * @param tagId - The tag id, with or without the leading `#`.
 */
export const resolveFunctionTag = (lookup: FunctionTagLookup, tagId: string): TagResolution => {
    const functions: string[] = [];
    const diagnostics: Diagnostic[] = [];
    const seen = new Set<string>();
    const open = new Set<string>();

    const visit = (id: string, required: boolean): void => {
        if (open.has(id)) {
            diagnostics.push({
                severity: 'error',
                code: 'tag.cycle',
                message: `the function tag #${id} references itself`
            });
            return;
        }

        const tag = lookup.get(id);
        if (!tag) {
            if (required) {
                diagnostics.push({
                    severity: 'error',
                    code: 'tag.missing-entry',
                    message: `the function tag #${id} does not exist`
                });
            }
            return;
        }

        open.add(id);
        for (const entry of tag.values) {
            const text = typeof entry === 'string' ? entry : entry.id;
            const entryRequired = typeof entry === 'string' ? true : entry.required !== false;
            const reference = parseFunctionReference(text);
            if (!reference) {
                diagnostics.push({
                    severity: 'error',
                    code: 'tag.missing-entry',
                    message: `'${text}' in #${id} is not a valid function reference`
                });
                continue;
            }

            if (reference.kind === 'tag') {
                visit(reference.id, entryRequired);
                continue;
            }

            if (seen.has(reference.id)) continue;
            seen.add(reference.id);
            functions.push(reference.id);
        }
        open.delete(id);
    };

    const start = normalizeIdentifier(tagId.startsWith('#') ? tagId.slice(1) : tagId);
    if (start === undefined) {
        return {
            functions: [],
            exists: false,
            diagnostics: [{ severity: 'error', code: 'tag.missing-entry', message: `'${tagId}' is not a valid tag id` }]
        };
    }

    const exists = lookup.get(start) !== undefined;
    visit(start, false);
    return { functions, exists, diagnostics };
};

/**
 * The tags a pack stack declares. Tags merge instead of replacing: every pack
 * that declares the same tag adds its entries, and only `replace: true`
 * discards what came before, which is how one pack adds to `minecraft:tick`
 * without hiding another pack's entry.
 */
export class FunctionTagRegistry implements FunctionTagLookup {
    private readonly tags = new Map<string, FunctionTagEntry[]>();

    /** Merges one tag file into the registry, honoring its `replace` flag. */
    public add(tagId: string, tag: FunctionTag): void {
        const id = normalizeIdentifier(tagId.startsWith('#') ? tagId.slice(1) : tagId);
        if (id === undefined) return;

        const existing = tag.replace ? undefined : this.tags.get(id);
        this.tags.set(id, [...(existing ?? []), ...tag.values]);
    }

    /** Returns the merged tag, or undefined when no pack declared it. */
    public get(tagId: string): FunctionTag | undefined {
        const values = this.tags.get(tagId);
        return values ? { values } : undefined;
    }

    /** Every tag id the stack declared. */
    public ids(): readonly string[] {
        return [...this.tags.keys()];
    }
}
