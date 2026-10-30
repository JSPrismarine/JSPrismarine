import { normalizeIdentifier } from '../identifier';
import { asObject } from './json';
import type { LevelStem } from './LevelStem';
import { parseLevelStem } from './LevelStem';

/** The stem every preset has to define. */
export const OVERWORLD_STEM_ID = 'minecraft:overworld';

/** One `worldgen/world_preset` document: the level stems a world starts with. */
export interface WorldPreset {
    /** Stems keyed by dimension id. Always holds `minecraft:overworld`. */
    readonly dimensions: ReadonlyMap<string, LevelStem>;
}

/**
 * Reads one `worldgen/world_preset` JSON document.
 *
 * @param path - Where the document came from, for error messages.
 * @throws When `dimensions` is missing, a stem is malformed, or `minecraft:overworld` is absent.
 */
export const parseWorldPreset = (json: unknown, path = '<world_preset>'): WorldPreset => {
    const raw = asObject(json, path);
    const source = asObject(raw['dimensions'], `${path}.dimensions`);
    const dimensions = new Map<string, LevelStem>();
    for (const [key, stem] of Object.entries(source)) {
        const id = normalizeIdentifier(key);
        if (dimensions.has(id)) throw new TypeError(`${path}.dimensions: ${JSON.stringify(id)} is defined twice`);
        dimensions.set(id, parseLevelStem(stem, `${path}.dimensions[${JSON.stringify(key)}]`));
    }
    if (!dimensions.has(OVERWORLD_STEM_ID)) {
        throw new TypeError(`${path}.dimensions: a world preset has to define ${JSON.stringify(OVERWORLD_STEM_ID)}`);
    }
    return { dimensions };
};
