/**
 * Where the generator finds Mojang's structure templates.
 *
 * The data generator writes JSON and no `.nbt`, so the templates are the one part of Java's
 * world generation data that is not in the datapack beside the features. They ship as
 * `data/minecraft/structure/<path>.nbt` inside the server jar, which is a bundler jar holding
 * the real one, and they are the same files `@jsprismarine/structures`' corpus test reads.
 *
 * Reading them out of the jar inflates every one of its 17655 entries, so it is not something to
 * do while a world is being generated. Two sources are supported, cheapest first: a directory of
 * loose `.nbt` files, read one file at a time, which is what
 * `pnpm --filter @jsprismarine/bedrock-data run extract:structures` leaves behind; and the jar
 * itself, read once and reduced to the templates, for a checkout that never ran that step.
 *
 * Everything here is extracted game data and therefore untrusted. The bytes are parsed by
 * `@jsprismarine/structures` and nothing in them is executed or resolved against the file system.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';
import { readZip } from '@jsprismarine/packs';
import type { JavaStructureTemplate } from '@jsprismarine/structures';
import { readJavaStructureTemplate } from '@jsprismarine/structures';

import type { TemplateSource } from './javaTemplatePlacement';
import type { JavaRegistry } from './javaWorldgenData';
import { PrismarineGenerationErrors } from '@jsprismarine/errors/prismarine/generation';

/** Points the loader at a local copy of one source. */
export const JAVA_TEMPLATE_ENV = {
    /** A directory of extracted `.nbt` templates, laid out as the datapack lays out a registry. */
    templates: 'JSP_JAVA_STRUCTURES',
    /** A Java server jar, the same variable `packages/bedrock-data/sources.json` documents. */
    jar: 'JSP_JAVA_JAR_PATH'
} as const;

/** Where the templates sit inside the inner server jar. */
const JAR_PREFIX = 'data/minecraft/structure/';

/** The inner jar a bundler jar holds, which is where the data actually is. */
const INNER_JAR = /^META-INF\/versions\/[^/]+\/server-[^/]+\.jar$/;

/**
 * Builds a source over a set of template files.
 *
 * Both halves are deferred: `files` runs on the first template a world asks for, and each file
 * is decoded once and kept. A world that buries no fossil never opens the jar.
 *
 * @param files - The raw `.nbt` bytes, keyed by namespaced identifier.
 * @param processorLists - The `worldgen/processor_list` registry, as the datapack loader read it.
 */
export const createTemplateSource = (
    files: () => ReadonlyMap<string, Uint8Array>,
    processorLists: JavaRegistry,
    worldgenFingerprint?: () => string
): TemplateSource => {
    const decoded = new Map<string, JavaStructureTemplate | undefined>();
    let bytes: ReadonlyMap<string, Uint8Array> | undefined;

    return {
        ...(worldgenFingerprint === undefined ? {} : { worldgenFingerprint }),
        template: (identifier) => {
            if (decoded.has(identifier)) return decoded.get(identifier);

            bytes ??= files();
            const file = bytes.get(identifier);
            let template: JavaStructureTemplate | undefined;
            try {
                template = file === undefined ? undefined : readJavaStructureTemplate(file);
            } catch {
                // A file this reader cannot make sense of places nothing, rather than failing
                // the chunk over one of the 1511 templates.
                template = undefined;
            }

            decoded.set(identifier, template);
            return template;
        },
        processorList: (identifier) => processorLists.get(identifier)
    };
};

/**
 * A source over a directory of extracted `.nbt` files, which is what the fetch leaves behind.
 *
 * Each template is read when it is first asked for, so a world that places one village reads
 * the dozen files that village is made of rather than all 1511.
 */
export const createDirectoryTemplateSource = (
    root: string,
    processorLists: JavaRegistry,
    worldgenFingerprint?: () => string
): TemplateSource => {
    const decoded = new Map<string, JavaStructureTemplate | undefined>();

    return {
        ...(worldgenFingerprint === undefined ? {} : { worldgenFingerprint }),
        template: (identifier) => {
            if (decoded.has(identifier)) return decoded.get(identifier);

            let template: JavaStructureTemplate | undefined;
            try {
                // Extracted game data: read as bytes, parsed, never executed. The identifier
                // comes from Mojang's own registries, and a path leaving the root resolves to
                // no file rather than to another one.
                const path = join(root, ...pathPartsOf(identifier));
                template = existsSync(path) ? readJavaStructureTemplate(readFileSync(path)) : undefined;
            } catch {
                template = undefined;
            }

            decoded.set(identifier, template);
            return template;
        },
        processorList: (identifier) => processorLists.get(identifier)
    };
};

/** The file path segments a namespaced identifier names, refusing anything that could escape. */
const pathPartsOf = (identifier: string): readonly string[] => {
    const parts = identifier.replace(/^minecraft:/, '').split('/');
    if (parts.some((part) => part === '' || part === '.' || part === '..' || part.includes('\\'))) return ['.missing'];

    const last = parts.at(-1);
    return last === undefined ? ['.missing'] : [...parts.slice(0, -1), `${last}.nbt`];
};

/**
 * The source for whatever the fetch left on disk for one Java release.
 *
 * Always returns a source: one that finds no files places no template, which is the same answer
 * the feature gets for a template this server does not carry.
 *
 * @param release - The Java release whose templates to read, the one the registries came from.
 *   Defaults to the release `sources.json` names as the default.
 */
export const findJavaTemplateSource = (
    cacheRoot: string,
    processorLists: JavaRegistry,
    release: string = javaServerCacheFolder
): TemplateSource => {
    const directory = javaTemplateDirectory(cacheRoot, release);
    if (directory !== undefined) {
        return createDirectoryTemplateSource(directory, processorLists, () =>
            fingerprintTemplateFiles(readTemplateDirectory(directory))
        );
    }

    let files: ReadonlyMap<string, Uint8Array> | undefined;
    const readFiles = (): ReadonlyMap<string, Uint8Array> => {
        files ??= findJavaTemplates(cacheRoot, release) ?? new Map();
        return files;
    };
    return createTemplateSource(readFiles, processorLists, () => fingerprintTemplateFiles(readFiles()));
};

/** Hashes names and raw bytes so template edits invalidate terrain built with structure beards. */
const fingerprintTemplateFiles = (files: ReadonlyMap<string, Uint8Array>): string => {
    const hash = createHash('sha256');
    for (const [identifier, bytes] of [...files].sort(([left], [right]) => compareStrings(left, right))) {
        hash.update(identifier).update('\0').update(bytes);
    }
    return hash.digest('hex');
};

const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * The extracted template directory, from the override or the release's folder in the cache, when
 * there is one.
 *
 * `extract:structures` writes each release to its own `java-structures/<release>/`, so the folder
 * is picked by name: the newest-named one could be a preview the world does not run.
 */
export const javaTemplateDirectory = (
    cacheRoot: string,
    release: string = javaServerCacheFolder
): string | undefined => {
    const override = process.env[JAVA_TEMPLATE_ENV.templates];
    if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;

    const directory = join(cacheRoot, 'java-structures', release);
    return existsSync(directory) ? directory : undefined;
};

/** Every `.nbt` under a directory, as `minecraft:<path without the extension>`. */
export const readTemplateDirectory = (root: string, namespace = 'minecraft'): Map<string, Uint8Array> => {
    const templates = new Map<string, Uint8Array>();
    if (!existsSync(root)) return templates;

    const walk = (directory: string, prefix: string): void => {
        for (const entry of readdirSync(directory).sort()) {
            const absolute = join(directory, entry);
            if (statSync(absolute).isDirectory()) {
                walk(absolute, `${prefix}${entry}/`);
                continue;
            }

            if (!entry.endsWith('.nbt')) continue;
            templates.set(`${namespace}:${prefix}${entry.slice(0, -'.nbt'.length)}`, readFileSync(absolute));
        }
    };

    walk(root, '');
    return templates;
};

/**
 * Every template inside a Java server jar.
 *
 * @throws {Error} When the jar carries no inner server jar, which means it is not the bundler
 *   jar Mojang publishes.
 */
export const readTemplateJar = (jarPath: string): Map<string, Uint8Array> => {
    const outer = readZip(readFileSync(jarPath));
    const innerName = [...outer.keys()].find((name) => INNER_JAR.test(name));
    const inner = innerName === undefined ? undefined : outer.get(innerName);
    if (inner === undefined) throw new PrismarineGenerationErrors.NoInnerServerJar({ jarPath });

    const templates = new Map<string, Uint8Array>();
    for (const [name, bytes] of readZip(inner)) {
        if (!name.startsWith(JAR_PREFIX) || !name.endsWith('.nbt')) continue;

        templates.set(`minecraft:${name.slice(JAR_PREFIX.length, -'.nbt'.length)}`, bytes);
    }

    return templates;
};

/**
 * Finds one Java release's templates on disk.
 *
 * @param cacheRoot - The `node_modules/.cache/jsprismarine` the fetch writes into.
 * @param release - The Java release whose templates to read. Defaults to the release
 *   `sources.json` names as the default.
 * @returns The raw bytes keyed by identifier, or undefined when neither source is there.
 */
export const findJavaTemplates = (
    cacheRoot: string,
    release: string = javaServerCacheFolder
): Map<string, Uint8Array> | undefined => {
    const directory = process.env[JAVA_TEMPLATE_ENV.templates];
    if (directory !== undefined && directory !== '') {
        const found = readTemplateDirectory(directory);
        return found.size === 0 ? undefined : found;
    }

    const extracted = javaTemplateDirectory(cacheRoot, release);
    if (extracted !== undefined) {
        const found = readTemplateDirectory(extracted);
        if (found.size > 0) return found;
    }

    const jar = javaServerJar(cacheRoot, release);
    return jar === undefined ? undefined : readTemplateJar(jar);
};

/**
 * The release's server jar, from either cache folder the fetch writes.
 *
 * There is no fallback to another release's jar. Its templates would sit beside this release's
 * structure and pool documents, and a template a release renamed or reshaped would place wrong.
 */
const javaServerJar = (cacheRoot: string, release: string): string | undefined => {
    const override = process.env[JAVA_TEMPLATE_ENV.jar];
    if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;

    return ['java-server', 'java']
        .map((root) => join(cacheRoot, root, release, 'server.jar'))
        .find((path) => existsSync(path));
};
