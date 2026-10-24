/**
 * Namespaced ids as `/function` and the function tag files use them. A
 * reference is either a function id (`minecraft:foo/bar`) or a tag id written
 * with a leading `#` (`#minecraft:tick`); both default to the `minecraft`
 * namespace when the colon is left out.
 */

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_./-]+$/;

/** The namespace an id without a colon belongs to. */
export const DEFAULT_NAMESPACE = 'minecraft';

/** A parsed reference to either one function or a function tag. */
export interface FunctionReference {
    /** Whether the reference named a tag (`#namespace:path`) or a single function. */
    kind: 'function' | 'tag';
    /** The namespaced id, always with an explicit namespace and without the `#`. */
    id: string;
}

/**
 * Normalizes a namespaced id, filling in the default namespace.
 *
 * @returns The `namespace:path` form, or undefined when either half is not a legal id.
 */
export const normalizeIdentifier = (text: string): string | undefined => {
    const colon = text.indexOf(':');
    const namespace = colon === -1 ? DEFAULT_NAMESPACE : text.slice(0, colon);
    const path = colon === -1 ? text : text.slice(colon + 1);
    if (!NAMESPACE_PATTERN.test(namespace) || !PATH_PATTERN.test(path)) return undefined;
    return `${namespace}:${path}`;
};

/**
 * Parses the argument of a `/function` call or a function tag entry.
 *
 * @returns The reference, or undefined when the text is not a legal id.
 */
export const parseFunctionReference = (text: string): FunctionReference | undefined => {
    const tag = text.startsWith('#');
    const id = normalizeIdentifier(tag ? text.slice(1) : text);
    if (id === undefined) return undefined;
    return { kind: tag ? 'tag' : 'function', id };
};

/** The file extension of a function file. */
export const FUNCTION_EXTENSION = '.mcfunction';

/**
 * Derives a function id from a pack-relative path, following the 26.3 layout
 * `data/<namespace>/function/<path>.mcfunction`.
 *
 * @returns The namespaced id, or undefined when the path is not a function file.
 */
export const functionIdForPath = (path: string): string | undefined => {
    if (!path.startsWith('data/') || !path.endsWith(FUNCTION_EXTENSION)) return undefined;

    const segments = path.slice('data/'.length, -FUNCTION_EXTENSION.length).split('/');
    const [namespace, folder, ...rest] = segments;
    if (!namespace || folder !== 'function' || rest.length === 0) return undefined;
    if (!NAMESPACE_PATTERN.test(namespace)) return undefined;

    const idPath = rest.join('/');
    if (!PATH_PATTERN.test(idPath)) return undefined;
    return `${namespace}:${idPath}`;
};

/**
 * Derives a function tag id from a pack-relative path, following
 * `data/<namespace>/tags/function/<path>.json`.
 *
 * @returns The namespaced tag id without a `#`, or undefined when the path is not a function tag.
 */
export const functionTagIdForPath = (path: string): string | undefined => {
    if (!path.startsWith('data/') || !path.endsWith('.json')) return undefined;

    const segments = path.slice('data/'.length, -'.json'.length).split('/');
    const [namespace, folder, registry, ...rest] = segments;
    if (!namespace || folder !== 'tags' || registry !== 'function' || rest.length === 0) return undefined;
    if (!NAMESPACE_PATTERN.test(namespace)) return undefined;

    const idPath = rest.join('/');
    if (!PATH_PATTERN.test(idPath)) return undefined;
    return `${namespace}:${idPath}`;
};
