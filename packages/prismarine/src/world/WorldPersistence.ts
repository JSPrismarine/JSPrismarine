import type { SavedWeather } from './Weather';
import { savedWeatherOf } from './Weather';

/** A non-player entity snapshot used by providers without actor storage. */
export interface LegacyWorldEntity {
    type: string;
    position: {
        x: number;
        y: number;
        z: number;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    };
}

/** World state a provider stores outside the chunk data. */
export interface WorldPersistenceData {
    spawn?: { x: number; y: number; z: number };
    gameRules?: Array<[string, [boolean | number, boolean]]>;
    weather?: SavedWeather;
    /** Used by providers that do not store actors in chunk data. */
    entities?: LegacyWorldEntity[];
}

/** Reads persisted world state at the JSON and NBT boundaries. */
export const worldPersistenceDataOf = (value: unknown): WorldPersistenceData => {
    if (!isRecord(value)) return {};

    const spawn = spawnOf(value['spawn']);
    const gameRules = gameRulesOf(value['gameRules']);
    const weather = savedWeatherOf(value['weather']);
    const entities = entitiesOf(value['entities']);

    return {
        ...(spawn === undefined ? {} : { spawn }),
        ...(gameRules === undefined ? {} : { gameRules }),
        ...(weather === undefined ? {} : { weather }),
        ...(entities === undefined ? {} : { entities })
    };
};

/** Validates legacy file data before migrating it and removing its source file. */
export const legacyWorldPersistenceDataOf = (value: unknown): WorldPersistenceData => {
    if (!isRecord(value)) throw new Error('Legacy world data must be an object');

    const data = worldPersistenceDataOf(value);
    if (value['spawn'] !== undefined && data.spawn === undefined) throw new Error('Legacy spawn position is invalid');
    if (value['weather'] !== undefined && data.weather === undefined) throw new Error('Legacy weather is invalid');
    if (value['gameRules'] !== undefined && !Array.isArray(value['gameRules']))
        throw new Error('Legacy game rules are invalid');
    if (Array.isArray(value['gameRules']) && (data.gameRules?.length ?? 0) !== value['gameRules'].length)
        throw new Error('Legacy game rules contain invalid entries');
    if (value['entities'] !== undefined && !Array.isArray(value['entities']))
        throw new Error('Legacy entity snapshots are invalid');
    if (Array.isArray(value['entities']) && (data.entities?.length ?? 0) !== value['entities'].length)
        throw new Error('Legacy entity snapshots contain invalid entries');

    return data;
};

/** Parses world state encoded as JSON inside provider storage. */
export const parseWorldPersistenceData = (text: string): WorldPersistenceData => {
    const parsed: unknown = JSON.parse(text);
    return worldPersistenceDataOf(parsed);
};

const spawnOf = (value: unknown): WorldPersistenceData['spawn'] | undefined => {
    if (!isRecord(value)) return undefined;
    const { x, y, z } = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return undefined;

    return { x, y, z };
};

const gameRulesOf = (value: unknown): WorldPersistenceData['gameRules'] | undefined => {
    if (!Array.isArray(value)) return undefined;

    const rules: NonNullable<WorldPersistenceData['gameRules']> = [];
    for (const entry of value) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') continue;

        const state = entry[1];
        if (!Array.isArray(state) || state.length !== 2) continue;
        const [ruleValue, editable] = state;
        if (typeof editable !== 'boolean') continue;
        if (typeof ruleValue !== 'boolean' && !isFiniteNumber(ruleValue)) continue;

        rules.push([entry[0], [ruleValue, editable]]);
    }

    return rules;
};

const entitiesOf = (value: unknown): LegacyWorldEntity[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    return value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry['type'] !== 'string' || !isRecord(entry['position'])) return [];

        const position = entry['position'];
        const { x, y, z } = position;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return [];

        const pitch = optionalNumber(position['pitch']);
        const yaw = optionalNumber(position['yaw']);
        const headYaw = optionalNumber(position['headYaw']);

        return [
            {
                type: entry['type'],
                position: {
                    x,
                    y,
                    z,
                    ...(pitch === undefined ? {} : { pitch }),
                    ...(yaw === undefined ? {} : { yaw }),
                    ...(headYaw === undefined ? {} : { headYaw })
                }
            }
        ];
    });
};

const optionalNumber = (value: unknown): number | undefined => (isFiniteNumber(value) ? value : undefined);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
