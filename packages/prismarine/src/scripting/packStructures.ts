/**
 * The structures behavior packs ship in `structures/`, which a script's `world.structureManager`
 * reads by id, as BDS does ([#3315](https://github.com/JSPrismarine/JSPrismarine/issues/3315)).
 *
 * A file's id is its path under `structures/` with the first folder as the namespace:
 * `structures/the_sift/portal.mcstructure` is `the_sift:portal`, and a file directly in
 * `structures/` is in the `mystructure` namespace, as the `pack-structures` scenario recorded.
 * Where two packs ship the same id, the later pack in the list wins, as it does for every
 * other definition.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ScriptBlockPermutation, ScriptStructure } from '@jsprismarine/script-host/host/world';
import { readMcStructure } from '@jsprismarine/structures/bedrockTemplate';

/** The namespace of a structure file directly in `structures/`. */
const DEFAULT_NAMESPACE = 'mystructure';
const EXTENSION = '.mcstructure';

/** The structures of a pack list, by id. */
export interface PackStructures {
    /** Every id the packs ship, in the order the packs and their files list them. */
    ids(): readonly string[];
    /** The structure an id names, read from its file the first time it is asked for. */
    get(id: string): ScriptStructure | undefined;
}

/** The id of a file under a pack's `structures/`, by its path there with `/` separators. */
const idOf = (relative: string): string => {
    const name = relative.slice(0, -EXTENSION.length);
    const slash = name.indexOf('/');
    return slash < 0 ? `${DEFAULT_NAMESPACE}:${name}` : `${name.slice(0, slash)}:${name.slice(slash + 1)}`;
};

/** Every structure file of one pack, by id. */
const filesOf = (directory: string): Map<string, string> => {
    const root = path.join(directory, 'structures');
    const files = new Map<string, string>();
    if (!existsSync(root)) return files;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(EXTENSION)) continue;
        const file = path.join(entry.parentPath, entry.name);
        files.set(idOf(path.relative(root, file).split(path.sep).join('/')), file);
    }
    return files;
};

/**
 * Reads the structures of a list of behavior packs.
 *
 * @param packDirectories - The packs, in the order the world applies them.
 * @param resolve - Completes a block's states, as BDS gives every state of a block a structure
 *   names; a block it cannot resolve keeps the states the file wrote.
 * @param warn - Told about a file that is not a structure, which is then left out.
 */
export const packStructuresOf = (
    packDirectories: readonly string[],
    resolve: (
        typeId: string,
        states: Readonly<Record<string, string | number | boolean>>
    ) => ScriptBlockPermutation | undefined,
    warn: (message: string) => void
): PackStructures => {
    const files = new Map<string, string>();
    for (const directory of packDirectories) for (const [id, file] of filesOf(directory)) files.set(id, file);
    const read = new Map<string, ScriptStructure | undefined>();
    const load = (file: string): ScriptStructure | undefined => {
        let template: ReturnType<typeof readMcStructure>;
        try {
            template = readMcStructure(readFileSync(file));
        } catch (error: unknown) {
            warn(`${file} is not a structure the server can read: ${String(error)}`);
            return undefined;
        }
        const [x, y, z] = template.size;
        const palette = template.palette.map(
            ({ name, states }) => resolve(name, states) ?? { typeId: name, states: { ...states } }
        );
        // A position the file leaves out is one a placement does not change, which -1 says.
        const blocks = Array.from({ length: x * y * z }, () => -1);
        for (const { pos, state } of template.blocks) {
            if (state >= 0) blocks[(pos[0] * y + pos[1]) * z + pos[2]] = state;
        }
        return { size: { x, y, z }, palette, blocks, saveMode: 'World' };
    };
    return {
        ids: () => [...files.keys()],
        get: (id) => {
            if (read.has(id)) return read.get(id);
            const file = files.get(id);
            const structure = file === undefined ? undefined : load(file);
            read.set(id, structure);
            return structure;
        }
    };
};
