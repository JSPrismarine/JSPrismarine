import { createHash } from 'node:crypto';

import type { LootRandomState, LootSequencesState } from '@jsprismarine/loot';
import type { SeededRandomState } from '@jsprismarine/predicates';

import type { RandomSequencesState } from '../command/host/randomSequences';
import type { ServerReplayRandomState } from '../Server';
import type { SavedWeather } from '../world/Weather';
import type Provider from '../world/providers/Provider';

const MANIFEST_FORMAT = 'jsprismarine-replay-initial-state';
const MANIFEST_VERSION = 2;

/** One resolved dimension input needed to identify the initial level setup. */
export interface ReplayDimensionManifest {
    /** The stem id, such as `minecraft:overworld`. */
    readonly id: string;
    /** The dimension type id bound to this stem. */
    readonly type: string;
    /** The effective generator kind used for this stem. */
    readonly generator: string;
}

/** One saved game rule in the form used by the level. */
export interface ReplayGameRuleManifest {
    readonly name: string;
    readonly value: boolean | number;
    readonly editable: boolean;
}

/** The persisted provider state required to recreate this replay's initial save. */
export interface ReplayStorageBoundary {
    readonly provider: string;
    readonly kind: 'provider-snapshot';
    readonly includesUnloadedPersistentState: true;
    /** The provider reads its logical state as one synchronous snapshot. */
    readonly captureAtomic: true;
    /** False because LevelDB records and its metadata files use separate storage writes. */
    readonly restoreAtomic: false;
    readonly restoresWorldState: true;
    /** Base64-encoded bytes returned by the named provider. */
    readonly snapshot: string;
    /** SHA-256 of the decoded snapshot bytes. */
    readonly snapshotDigest: string;
}

/** Versioned metadata and digests captured at the start of a replay run. */
export interface ReplayInitialStateManifest {
    readonly format: typeof MANIFEST_FORMAT;
    readonly version: typeof MANIFEST_VERSION;
    readonly level: {
        readonly name: string;
        readonly seed: string;
        readonly tick: number;
        readonly weather: SavedWeather;
        readonly gameRules: readonly ReplayGameRuleManifest[];
        readonly dimensions: readonly ReplayDimensionManifest[];
    };
    /** The pack definitions and repository-owned data the server content build resolved. */
    readonly contentFingerprint: string;
    /** The dimension stems, dimension types, and active Java worldgen registry data. */
    readonly worldgenFingerprint: string;
    /** A combined fingerprint for the content and world-generation inputs above. */
    readonly activeContentFingerprint: string;
    /** State of the server's stateful random sources at this boundary. */
    readonly randomState: ServerReplayRandomState;
    /** Digests of ready, loaded worlds. These are verification values, not restorable chunks. */
    readonly loadedWorldDigests: readonly (readonly [dimension: string, digest: string])[];
    /** Explains which provider-backed state this manifest can verify or restore. */
    readonly storageBoundary: ReplayStorageBoundary;
}

/** Hashes JSON-shaped runtime inputs while sorting object and map keys. */
export const replayInputFingerprint = (value: unknown): string => {
    const stable = stableData(value);
    return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
};

/** Serializes a manifest as UTF-8 JSON bytes. */
export const serializeReplayInitialStateManifest = (manifest: ReplayInitialStateManifest): Buffer => {
    if (!isManifest(manifest)) throw new TypeError('Invalid replay initial-state manifest');
    return Buffer.from(JSON.stringify(manifest), 'utf8');
};

/** Parses a JSON manifest and rejects unsupported versions or incomplete state. */
export const deserializeReplayInitialStateManifest = (bytes: Uint8Array): ReplayInitialStateManifest => {
    let value: unknown;
    try {
        value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
        throw new TypeError('Invalid replay initial-state manifest JSON');
    }

    if (!isManifest(value)) throw new TypeError('Unsupported or invalid replay initial-state manifest');
    return value;
};

/**
 * Restores the persisted part of a replay boundary before its provider opens the world.
 *
 * @param provider - A new, disabled provider of the same type that captured the manifest.
 * @param manifest - The validated initial-state manifest to restore.
 * @throws {TypeError} When the manifest or snapshot digest is invalid.
 * @throws {Error} When the provider differs or does not support replay restoration.
 */
export const restoreReplayInitialStateSnapshot = async (
    provider: Provider,
    manifest: ReplayInitialStateManifest
): Promise<void> => {
    if (!isManifest(manifest)) throw new TypeError('Invalid replay initial-state manifest');
    if (provider.constructor.name !== manifest.storageBoundary.provider) {
        throw new Error('Replay snapshot provider does not match the manifest');
    }

    const restore = provider.restoreReplaySnapshot;
    if (restore === undefined) {
        throw new Error(`Provider '${manifest.storageBoundary.provider}' cannot restore replay snapshots`);
    }

    const snapshot = Buffer.from(manifest.storageBoundary.snapshot, 'base64');
    await restore.call(provider, snapshot);
};

const stableData = (value: unknown, ancestors = new WeakSet<object>()): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return '[function]';
    if (typeof value !== 'object') return String(value);
    if (ancestors.has(value)) return `[cycle:${value.constructor.name}]`;

    ancestors.add(value);
    let normalized: unknown;
    if (Array.isArray(value)) {
        normalized = value.map((entry) => stableData(entry, ancestors));
    } else if (value instanceof Map) {
        normalized = {
            type: 'Map',
            entries: [...value]
                .map(([key, entry]) => [stableData(key, ancestors), stableData(entry, ancestors)] as const)
                .sort(([left], [right]) => compareJson(left, right))
        };
    } else if (value instanceof Set) {
        normalized = [...value].map((entry) => stableData(entry, ancestors)).sort(compareJson);
    } else {
        const entries: [string, unknown][] = [];
        for (const key of Object.keys(value).sort()) {
            const property = Object.getOwnPropertyDescriptor(value, key);
            if (property !== undefined && 'value' in property) entries.push([key, property.value]);
        }
        normalized = Object.fromEntries(entries.map(([key, entry]) => [key, stableData(entry, ancestors)]));
    }
    ancestors.delete(value);
    return normalized;
};

const compareJson = (left: unknown, right: unknown): number => {
    const leftKey = JSON.stringify(left) ?? '';
    const rightKey = JSON.stringify(right) ?? '';
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isSeededRandomState = (value: unknown): value is SeededRandomState =>
    isObject(value) &&
    value['version'] === 1 &&
    value['algorithm'] === 'mulberry32' &&
    typeof value['state'] === 'number' &&
    Number.isInteger(value['state']) &&
    value['state'] >= 0 &&
    value['state'] <= 0xffffffff;

const isLootRandomState = (value: unknown): value is LootRandomState =>
    isObject(value) &&
    value['version'] === 1 &&
    value['algorithm'] === 'xoroshiro128++' &&
    typeof value['lo'] === 'string' &&
    typeof value['hi'] === 'string';

const isLootSequencesState = (value: unknown): value is LootSequencesState =>
    isObject(value) &&
    value['version'] === 1 &&
    typeof value['worldSeed'] === 'string' &&
    isLootRandomState(value['unkeyed']) &&
    Array.isArray(value['streams']) &&
    value['streams'].every(
        (entry) =>
            Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && isLootRandomState(entry[1])
    );

const isCommandStreamState = (value: unknown): boolean =>
    Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && isLootRandomState(value[1]);

const isCommandSequencesState = (value: unknown): value is RandomSequencesState =>
    isObject(value) &&
    value['version'] === 1 &&
    typeof value['worldSeed'] === 'string' &&
    (value['unkeyed'] === null || isCommandStreamState(value['unkeyed'])) &&
    Array.isArray(value['streams']) &&
    value['streams'].every(
        (entry) =>
            Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && isCommandStreamState(entry[1])
    );

const isServerReplayRandomState = (value: unknown): value is ServerReplayRandomState =>
    isObject(value) &&
    value['version'] === 1 &&
    isSeededRandomState(value['server']) &&
    Array.isArray(value['contentWorlds']) &&
    value['contentWorlds'].every(
        (entry) =>
            Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && isSeededRandomState(entry[1])
    ) &&
    isLootSequencesState(value['javaLoot']) &&
    isLootSequencesState(value['bedrockLoot']) &&
    isCommandSequencesState(value['commandSequences']);

const isWeather = (value: unknown): value is SavedWeather =>
    isObject(value) &&
    ['clearWeatherTime', 'rainTime', 'thunderTime'].every(
        (field) => typeof value[field] === 'number' && Number.isFinite(value[field])
    ) &&
    typeof value['raining'] === 'boolean' &&
    typeof value['thundering'] === 'boolean';

const isCanonicalBase64 = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && Buffer.from(value, 'base64').toString('base64') === value;

const isStorageBoundary = (
    value: Record<string, unknown>
): value is Record<string, unknown> & ReplayStorageBoundary => {
    if (
        typeof value['provider'] !== 'string' ||
        value['kind'] !== 'provider-snapshot' ||
        value['includesUnloadedPersistentState'] !== true ||
        value['captureAtomic'] !== true ||
        value['restoreAtomic'] !== false ||
        value['restoresWorldState'] !== true ||
        !isCanonicalBase64(value['snapshot']) ||
        !isFingerprint(value['snapshotDigest'])
    ) {
        return false;
    }

    const digest = createHash('sha256').update(Buffer.from(value['snapshot'], 'base64')).digest('hex');
    return digest === value['snapshotDigest'];
};

const isManifest = (value: unknown): value is ReplayInitialStateManifest => {
    if (
        !isObject(value) ||
        value['format'] !== MANIFEST_FORMAT ||
        value['version'] !== MANIFEST_VERSION ||
        !isObject(value['level']) ||
        !isObject(value['storageBoundary'])
    ) {
        return false;
    }

    const level = value['level'];
    const storage = value['storageBoundary'];
    return (
        typeof level['name'] === 'string' &&
        typeof level['seed'] === 'string' &&
        typeof level['tick'] === 'number' &&
        Number.isFinite(level['tick']) &&
        isWeather(level['weather']) &&
        Array.isArray(level['gameRules']) &&
        level['gameRules'].every(
            (rule) =>
                isObject(rule) &&
                typeof rule['name'] === 'string' &&
                (typeof rule['value'] === 'boolean' ||
                    (typeof rule['value'] === 'number' && Number.isFinite(rule['value']))) &&
                typeof rule['editable'] === 'boolean'
        ) &&
        Array.isArray(level['dimensions']) &&
        level['dimensions'].every(
            (dimension) =>
                isObject(dimension) &&
                typeof dimension['id'] === 'string' &&
                typeof dimension['type'] === 'string' &&
                typeof dimension['generator'] === 'string'
        ) &&
        isFingerprint(value['contentFingerprint']) &&
        isFingerprint(value['worldgenFingerprint']) &&
        isFingerprint(value['activeContentFingerprint']) &&
        isServerReplayRandomState(value['randomState']) &&
        Array.isArray(value['loadedWorldDigests']) &&
        value['loadedWorldDigests'].every(
            (entry) =>
                Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && isFingerprint(entry[1])
        ) &&
        isStorageBoundary(storage)
    );
};

const isFingerprint = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
