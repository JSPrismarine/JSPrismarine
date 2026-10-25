/**
 * The functions and function tags a pack stack holds, compiled once.
 *
 * `@jsprismarine/packs` routes `data/<namespace>/function/*.mcfunction` into
 * its `functions` registry with the file's text as the definition, and routes
 * `data/<namespace>/tags/function/*.json` into the shared `tags` map, which
 * `ContentTags` has already merged across packs and expanded nested `#tag`
 * references in. So both halves are resolved before this module sees them:
 * what is left is compiling each file and presenting the tags in the shape
 * `@jsprismarine/mcfunction` reads.
 */
import type { Diagnostic, FunctionTag, FunctionTagLookup } from '@jsprismarine/mcfunction';
import { FunctionRegistry, compileFunction } from '@jsprismarine/mcfunction';
import type { Definition } from '@jsprismarine/packs';

import type { ServerContent } from '../../content/ServerContent';
import type { ContentTags } from '../../content/tags';

/** The registry a datapack's function tags live in, as `routeDatapackPath` names it. */
const FUNCTION_TAG_REGISTRY = 'function';

/**
 * The two halves of a content build this module reads.
 *
 * Narrower than `ServerContent` on purpose: a test states a map of functions
 * and a tag table and gets the real compile, and nothing here is coupled to
 * the eighteen other registries a content build carries.
 */
export interface FunctionContent {
    /** The `functions` registry of a loaded pack stack, whose `data` is the file's text. */
    readonly functions: ReadonlyMap<string, Definition>;
    /** The merged tags, read for the `function` registry alone. */
    readonly tags?: Pick<ContentTags, 'has' | 'members' | 'tags'>;
}

/** What a pack stack's function half amounts to. */
export interface ServerFunctions {
    /** Every function that compiled, keyed by namespaced id. */
    readonly functions: FunctionRegistry;
    /** The function tags, which `/function #tag` and the tick tag resolve through. */
    readonly tags: FunctionTagLookup;
    /** Every tag id the stack declares, for a caller that wants to list them. */
    readonly tagIds: readonly string[];
    /** Everything compiling reported. A file that did not compile is left out. */
    readonly diagnostics: readonly Diagnostic[];
}

/**
 * A tag lookup over the content build's merged tags.
 *
 * `ContentTags.members` has already expanded nested tags and cut cycles, so
 * every member it reports is a function id. `resolveFunctionTag` expands
 * again on top of that, which is a no-op on a list with no `#` in it.
 */
const tagLookupOf = (tags: FunctionContent['tags']): FunctionTagLookup => ({
    get: (tagId: string): FunctionTag | undefined =>
        tags?.has(FUNCTION_TAG_REGISTRY, tagId) ? { values: tags.members(FUNCTION_TAG_REGISTRY, tagId) } : undefined
});

/**
 * Compiles every function the stack registered.
 *
 * @param content - The function half of a content build, or undefined when
 *   `content-packs` is off. Without it the stack held no datapack, so the
 *   result is an empty registry rather than a refusal: `/function` then
 *   reports that the function it was given does not exist, which is what Java
 *   reports for the same input.
 */
export const loadServerFunctions = (content: FunctionContent | undefined): ServerFunctions => {
    const functions = new FunctionRegistry();
    const diagnostics: Diagnostic[] = [];

    for (const definition of content?.functions.values() ?? []) {
        // The registry holds the file's text verbatim; anything else means the
        // loader routed something that is not an mcfunction into it.
        if (typeof definition.data !== 'string') continue;

        const compiled = compileFunction(definition.identifier, definition.data);
        for (const diagnostic of compiled.diagnostics) diagnostics.push({ ...diagnostic, pack: definition.pack });
        if (compiled.function) functions.add(compiled.function, definition.pack);
    }

    return {
        functions,
        tags: tagLookupOf(content?.tags),
        tagIds: content?.tags?.tags(FUNCTION_TAG_REGISTRY) ?? [],
        diagnostics
    };
};

/**
 * The function half of a content build.
 *
 * The one place the narrow {@link FunctionContent} is joined back to the
 * whole, so everything else in this directory stays free of the eighteen
 * registries it does not read.
 *
 * @returns The two registries, or undefined when no content was built.
 */
export const functionContentOf = (content: ServerContent | undefined): FunctionContent | undefined =>
    content === undefined ? undefined : { functions: content.definitions.functions, tags: content.tags };
