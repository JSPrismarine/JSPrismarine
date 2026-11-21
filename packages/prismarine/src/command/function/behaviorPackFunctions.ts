/**
 * The functions a world's behavior packs hold, read from their folders.
 *
 * Bedrock keeps them apart from a datapack's: `functions/**\/*.mcfunction` in a behavior pack,
 * addressed by the path under `functions/` without the extension, so `functions/init/ouch.mcfunction`
 * runs as `/function init/ouch`. There are no function tags; `functions/tick.json` lists the
 * functions to run every tick, and the lists of every pack add up
 * (docs/research/commands-functions-and-datapack-execution.md, "Bedrock's equivalent").
 *
 * They are read from disk each time rather than taken from the content build, so `/reload` picks
 * up an edited file without rebuilding the content.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { TICK_FUNCTION_TAG } from '@jsprismarine/mcfunction';
import type { Definition } from '@jsprismarine/packs';

import type { FunctionContent } from './load';
import { FUNCTION_TAG_REGISTRY } from './load';

const FUNCTIONS_FOLDER = 'functions';
const EXTENSION = '.mcfunction';
/** The namespace a path without one resolves to, so `/function init/ouch` finds the file. */
const NAMESPACE = 'minecraft';

/** What the behavior packs' function folders hold. */
export interface BehaviorPackFunctions {
    /** Each function by namespaced id; a later pack's file replaces an earlier pack's. */
    readonly functions: ReadonlyMap<string, Definition>;
    /** The ids every pack's `tick.json` lists, in pack order. */
    readonly tick: readonly string[];
    /** A file that could not be read, for the log. */
    readonly problems: readonly string[];
}

/** The id `/function` reaches a file by: its path under `functions/`, in the default namespace. */
const idOf = (relative: string): string => `${NAMESPACE}:${relative.replaceAll('\\', '/')}`;

/** Reads `tick.json`'s `values`, the function paths to run every tick. */
const readTickList = (file: string, problems: string[]): string[] => {
    try {
        // A Bedrock pack file: the shape is checked below rather than assumed.
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
        const values = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'values') : undefined;
        if (!Array.isArray(values)) {
            problems.push(`${file} has no "values" list.`);
            return [];
        }
        return values.filter((value): value is string => typeof value === 'string').map(idOf);
    } catch (error) {
        problems.push(`${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
};

/**
 * Reads the functions of each behavior pack folder, in the order the packs load.
 *
 * @param directories - The behavior pack folders, as `Server.getWorldPackDirectories` lists them.
 */
export const readBehaviorPackFunctions = (directories: readonly string[]): BehaviorPackFunctions => {
    const functions = new Map<string, Definition>();
    const tick: string[] = [];
    const problems: string[] = [];
    for (const directory of directories) {
        const root = path.join(directory, FUNCTIONS_FOLDER);
        if (!existsSync(root) || !statSync(root).isDirectory()) continue;
        const pack = path.basename(directory);
        for (const entry of readdirSync(root, { recursive: true, encoding: 'utf8' }).sort()) {
            if (!entry.endsWith(EXTENSION)) continue;
            const file = path.join(root, entry);
            const identifier = idOf(entry.slice(0, -EXTENSION.length));
            try {
                functions.set(identifier, {
                    identifier,
                    registry: 'functions',
                    pack,
                    path: path.posix.join(FUNCTIONS_FOLDER, entry.replaceAll('\\', '/')),
                    data: readFileSync(file, 'utf8')
                });
            } catch (error) {
                problems.push(`${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const tickFile = path.join(root, 'tick.json');
        if (existsSync(tickFile)) tick.push(...readTickList(tickFile, problems));
    }
    return { functions, tick, problems };
};

/**
 * Adds the behavior packs' functions to a content build's: their files after the datapacks', and
 * their `tick.json` lists to `#minecraft:tick`.
 *
 * @param content - The datapack functions and tags.
 * @param packs - What {@link readBehaviorPackFunctions} read.
 */
export const withBehaviorPackFunctions = (content: FunctionContent, packs: BehaviorPackFunctions): FunctionContent => {
    if (packs.functions.size === 0 && packs.tick.length === 0) return content;
    const tags = content.tags;
    const addsTick = (registry: string, tag: string): boolean =>
        registry === FUNCTION_TAG_REGISTRY && tag === TICK_FUNCTION_TAG && packs.tick.length > 0;
    return {
        functions: new Map([...content.functions, ...packs.functions]),
        tags: {
            has: (registry, tag) => addsTick(registry, tag) || (tags?.has(registry, tag) ?? false),
            members: (registry, tag) => {
                const declared = tags?.has(registry, tag) ? tags.members(registry, tag) : [];
                return addsTick(registry, tag) ? [...new Set([...declared, ...packs.tick])] : declared;
            },
            tags: (registry) => {
                const declared = tags?.tags(registry) ?? [];
                return addsTick(registry, TICK_FUNCTION_TAG) && !declared.includes(TICK_FUNCTION_TAG)
                    ? [...declared, TICK_FUNCTION_TAG]
                    : declared;
            }
        }
    };
};
