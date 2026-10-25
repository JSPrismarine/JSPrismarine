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
 * loose `.nbt` files, which is what a fetch step should leave behind, and the jar itself, read
 * once and reduced to the 4 MB of templates.
 *
 * Everything here is extracted game data and therefore untrusted. The bytes are parsed by
 * `@jsprismarine/structures` and nothing in them is executed or resolved against the file system.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { readZip } from '@jsprismarine/packs';
import type { JavaStructureTemplate } from '@jsprismarine/structures';
import { readJavaStructureTemplate } from '@jsprismarine/structures';

import type { TemplateSource } from './javaTemplatePlacement';
import type { JavaRegistry } from './javaWorldgenData';

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
    processorLists: JavaRegistry
): TemplateSource => {
    const decoded = new Map<string, JavaStructureTemplate | undefined>();
    let bytes: ReadonlyMap<string, Uint8Array> | undefined;

    return {
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
 * The source for whatever the fetch left on disk.
 *
 * Always returns a source: one that finds no files places no template, which is the same answer
 * the feature gets for a template this server does not carry.
 */
export const findJavaTemplateSource = (cacheRoot: string, processorLists: JavaRegistry): TemplateSource =>
    createTemplateSource(() => findJavaTemplates(cacheRoot) ?? new Map(), processorLists);

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
    if (inner === undefined) throw new Error(`${jarPath} holds no inner server jar`);

    const templates = new Map<string, Uint8Array>();
    for (const [name, bytes] of readZip(inner)) {
        if (!name.startsWith(JAR_PREFIX) || !name.endsWith('.nbt')) continue;

        templates.set(`minecraft:${name.slice(JAR_PREFIX.length, -'.nbt'.length)}`, bytes);
    }

    return templates;
};

/**
 * Finds the templates on disk.
 *
 * @param cacheRoot - The `node_modules/.cache/jsprismarine` the fetch writes into.
 * @returns The raw bytes keyed by identifier, or undefined when neither source is there.
 */
export const findJavaTemplates = (cacheRoot: string): Map<string, Uint8Array> | undefined => {
    const directory = process.env[JAVA_TEMPLATE_ENV.templates];
    if (directory !== undefined && directory !== '') {
        const found = readTemplateDirectory(directory);
        return found.size === 0 ? undefined : found;
    }

    const extracted = newestVersionIn(join(cacheRoot, 'java-structures'));
    if (extracted !== undefined) {
        const found = readTemplateDirectory(extracted);
        if (found.size > 0) return found;
    }

    const jar = javaServerJar(cacheRoot);
    return jar === undefined ? undefined : readTemplateJar(jar);
};

/** The pinned server jar, taking whichever version the fetch wrote. */
const javaServerJar = (cacheRoot: string): string | undefined => {
    const override = process.env[JAVA_TEMPLATE_ENV.jar];
    if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;

    for (const root of ['java-server', 'java']) {
        const version = newestVersionIn(join(cacheRoot, root), 'server.jar');
        if (version !== undefined) return join(version, 'server.jar');
    }

    return undefined;
};

/** The newest version directory under a cache folder, optionally one holding a named entry. */
const newestVersionIn = (root: string, holds?: string): string | undefined => {
    if (!existsSync(root)) return undefined;

    for (const entry of readdirSync(root).sort().reverse()) {
        const candidate = join(root, entry);
        if (holds === undefined || existsSync(join(candidate, holds))) return candidate;
    }

    return undefined;
};
