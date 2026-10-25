import { EntityTypes } from '@jsprismarine/entities';
import { parseLenientJson } from '@jsprismarine/packs';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { REFERENCES } from './references.ts';

/**
 * Loads Mojang's own vanilla entity definitions out of the fetched behavior pack and resolves
 * them into entity types, so the entity rows compare against what the server would actually
 * run rather than against the JSON text.
 *
 * The pack is a fetched source, so the entity families declare it in `describeFamily` and do
 * not reach this module at all when the fetch cache is empty.
 */

/** A loaded entity file: the parsed JSON with the pack and path a diagnostic names. */
interface EntityFileInput {
    data: unknown;
    pack: string;
    path: string;
}

const isEntityFile = (data: unknown): boolean =>
    typeof data === 'object' && data !== null && 'minecraft:entity' in data;

/**
 * Resolves the vanilla entity pack into a type table.
 *
 * A few files under `entities/` are tables rather than definitions, such as `sniffer_seeds`,
 * and they are skipped the way `@jsprismarine/entities` own vanilla test skips them.
 * @throws {Error} When the behavior pack is not in the fetch cache.
 */
export const loadVanillaEntityTypes = (): EntityTypes => {
    const checkout = REFERENCES.bedrockBehaviorPack.locate();
    if (checkout === undefined) throw new Error('the vanilla behavior pack is not in the fetch cache');

    const root = join(checkout, 'behavior_pack', 'entities');
    const files: EntityFileInput[] = [];
    for (const name of readdirSync(root)) {
        if (!name.endsWith('.json')) continue;
        // Extracted game files are untrusted input; the lenient parser is all that reads them.
        const data = parseLenientJson(readFileSync(join(root, name), 'utf-8'));
        if (isEntityFile(data)) files.push({ data, pack: 'bedrock-samples', path: `entities/${name}` });
    }

    const types = new EntityTypes();
    types.load(files);
    return types;
};
