/**
 * Bounded persistence for immutable terrain-status proto chunks.
 *
 * The record is a small JSON header followed by a V8-serialized region payload. The payload
 * checksum rejects partial or altered records before the generator adopts any buffers.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';

import type { GenerationRegionPayload } from './GenerationRegion';

const RECORD_MAGIC = 'jsprismarine-terrain-proto';
// Bump when the record header or serialized region shape changes.
const RECORD_SCHEMA_VERSION = 1;
// Bump when the terrain status algorithm changes without a record-shape change.
const GENERATOR_VERSION = 1;
const STATUS = 'terrain';
const CACHE_FILE = /^terrain-[a-f0-9]{64}\.bin$/;

/** The chunk geometry a cached terrain tile must match before the generator can adopt it. */
export interface TerrainProtoIdentity {
    /** Chunk X coordinate. */
    readonly chunkX: number;
    /** Chunk Z coordinate. */
    readonly chunkZ: number;
    /** Lowest Y coordinate of the world dimension. */
    readonly minY: number;
    /** Number of Y levels in the world dimension. */
    readonly height: number;
}

/** Events from an opt-in terrain proto cache, suitable for workload measurements. */
export interface TerrainProtoCacheEvent {
    /** Whether the cache used, skipped, or removed a record. */
    readonly type: 'hit' | 'miss' | 'corrupt' | 'invalidate' | 'write' | 'skip' | 'evict';
    /** Record size for reads and writes, or file size for an eviction. */
    readonly bytes?: number;
}

/** Configuration for an opt-in disk cache of terrain-status proto chunks. */
export interface TerrainProtoCacheOptions {
    /** A dedicated directory for versioned cache records. */
    readonly directory: string;
    /** Maximum bytes held by cache records and temporary writes. */
    readonly maxBytes: number;
    /**
     * Identifies the code that builds the tiles, such as the server version.
     *
     * It becomes part of every record's key, so a build that generates different terrain never
     * reads what an older one wrote. The records left behind age out under `maxBytes`.
     */
    readonly codeVersion?: string;
    /** Observe cache events without changing generation behavior. Observer errors are ignored. */
    readonly onEvent?: (event: TerrainProtoCacheEvent) => void;
}

interface CacheHeader {
    readonly magic: string;
    readonly schemaVersion: number;
    readonly generatorVersion: number;
    readonly v8Version: string;
    readonly status: string;
    readonly key: string;
    readonly payloadDigest: string;
}

interface CacheFile {
    readonly name: string;
    readonly path: string;
    readonly size: number;
    readonly modified: number;
}

/** Reads and writes validated terrain proto records under a fixed byte budget. */
export class TerrainProtoCache {
    private writeQueue: Promise<void> = Promise.resolve();
    private readonly accessOrder = new Map<string, number>();
    private nextAccessOrder = 1;

    public constructor(private readonly options: TerrainProtoCacheOptions) {
        if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) {
            throw new RangeError('Terrain proto cache maxBytes must be a positive safe integer');
        }
    }

    /**
     * Reads one record if its versions, checksum, and region geometry match.
     *
     * Invalid records are removed and reported as a miss so the caller can regenerate the tile.
     */
    public async read(key: string, expected: TerrainProtoIdentity): Promise<GenerationRegionPayload | undefined> {
        if (!isCacheKey(key)) return undefined;
        const path = this.pathFor(key);
        let bytes: Buffer;
        try {
            const file = await stat(path);
            if (!file.isFile() || file.size > this.options.maxBytes) {
                await this.remove(path);
                this.emit('invalidate', file.size);
                return undefined;
            }
            bytes = await readFile(path);
        } catch {
            this.emit('miss');
            return undefined;
        }
        if (bytes.byteLength > this.options.maxBytes) return this.reject(path, 'invalidate', bytes.byteLength);

        const separator = bytes.indexOf(10);
        if (separator < 1 || separator > 16) return this.reject(path, 'corrupt', bytes.byteLength);
        const headerLengthText = bytes.toString('ascii', 0, separator);
        const headerLength = Number(headerLengthText);
        const headerStart = separator + 1;
        const payloadStart = headerStart + headerLength + 1;
        if (
            !/^\d+$/.test(headerLengthText) ||
            !Number.isSafeInteger(headerLength) ||
            headerLength < 2 ||
            headerLength > 2048 ||
            payloadStart > bytes.byteLength ||
            bytes[headerStart + headerLength] !== 10
        ) {
            return this.reject(path, 'corrupt', bytes.byteLength);
        }

        let headerValue: unknown;
        try {
            headerValue = JSON.parse(bytes.toString('utf8', headerStart, headerStart + headerLength));
        } catch {
            return this.reject(path, 'corrupt', bytes.byteLength);
        }

        const payloadBytes = bytes.subarray(payloadStart);
        if (
            !isCacheHeader(headerValue) ||
            headerValue.magic !== RECORD_MAGIC ||
            headerValue.schemaVersion !== RECORD_SCHEMA_VERSION ||
            headerValue.generatorVersion !== GENERATOR_VERSION ||
            headerValue.v8Version !== process.versions.v8 ||
            headerValue.status !== STATUS ||
            headerValue.key !== key
        ) {
            return this.reject(path, 'invalidate', bytes.byteLength);
        }

        const payloadDigest = createHash('sha256').update(payloadBytes).digest('hex');
        if (payloadDigest !== headerValue.payloadDigest) return this.reject(path, 'corrupt', bytes.byteLength);

        let payloadValue: unknown;
        try {
            payloadValue = deserialize(payloadBytes);
        } catch {
            return this.reject(path, 'corrupt', bytes.byteLength);
        }

        if (!isGenerationRegionPayload(payloadValue) || !matchesIdentity(payloadValue, expected)) {
            return this.reject(path, 'invalidate', bytes.byteLength);
        }

        this.touch(path);
        this.emit('hit', bytes.byteLength);
        return payloadValue;
    }

    /** Writes a checksummed record by renaming a completed temporary file into place. */
    public async write(key: string, payload: GenerationRegionPayload): Promise<void> {
        if (!isCacheKey(key) || !isGenerationRegionPayload(payload)) return;

        const write = this.writeQueue.then(() => this.writeQueued(key, payload));
        this.writeQueue = write.catch(() => undefined);
        await write;
    }

    /** Removes a record that failed region adoption and reports the invalidation. */
    public async invalidate(key: string): Promise<void> {
        if (!isCacheKey(key)) return;
        await this.remove(this.pathFor(key));
        this.emit('invalidate');
    }

    private async writeQueued(key: string, payload: GenerationRegionPayload): Promise<void> {
        let payloadBytes: Buffer;
        try {
            payloadBytes = serialize(payload);
        } catch {
            this.emit('skip');
            return;
        }

        const header: CacheHeader = {
            magic: RECORD_MAGIC,
            schemaVersion: RECORD_SCHEMA_VERSION,
            generatorVersion: GENERATOR_VERSION,
            v8Version: process.versions.v8,
            status: STATUS,
            key,
            payloadDigest: createHash('sha256').update(payloadBytes).digest('hex')
        };
        const headerBytes = Buffer.from(JSON.stringify(header));
        const bytes = Buffer.concat([
            Buffer.from(`${headerBytes.byteLength}\n`),
            headerBytes,
            Buffer.from('\n'),
            payloadBytes
        ]);
        if (bytes.byteLength > this.options.maxBytes) {
            this.emit('skip', bytes.byteLength);
            return;
        }

        try {
            await mkdir(this.options.directory, { recursive: true });
            const target = this.pathFor(key);
            if (!(await this.makeRoom(target, bytes.byteLength))) {
                this.emit('skip', bytes.byteLength);
                return;
            }

            const temporary = join(this.options.directory, `.terrain-${randomUUID()}.tmp`);
            try {
                await writeFile(temporary, bytes, { flag: 'wx' });
                await rename(temporary, target);
            } catch {
                await this.remove(temporary);
                this.emit('skip', bytes.byteLength);
                return;
            }
            this.touch(target);
            this.emit('write', bytes.byteLength);
        } catch {
            this.emit('skip', bytes.byteLength);
        }
    }

    private async makeRoom(target: string, incomingBytes: number): Promise<boolean> {
        let files: CacheFile[];
        try {
            files = await this.files();
        } catch {
            return false;
        }

        let bytesHeld = files.reduce((total, file) => total + file.size, 0);

        // Keep recency in memory so a cache hit never rewrites the record or its timestamp.
        const oldestFirst = files
            .filter((file) => file.path !== target && CACHE_FILE.test(file.name))
            .sort(
                (left, right) =>
                    (this.accessOrder.get(left.path) ?? 0) - (this.accessOrder.get(right.path) ?? 0) ||
                    left.modified - right.modified
            );
        for (const file of oldestFirst) {
            if (bytesHeld + incomingBytes <= this.options.maxBytes) break;
            if (!(await this.remove(file.path))) return false;
            bytesHeld -= file.size;
            this.emit('evict', file.size);
        }

        return bytesHeld + incomingBytes <= this.options.maxBytes;
    }

    private async files(): Promise<CacheFile[]> {
        const entries = await readdir(this.options.directory);
        const files: CacheFile[] = [];
        for (const name of entries) {
            const path = join(this.options.directory, name);
            try {
                const file = await stat(path);
                if (file.isFile()) files.push({ name, path, size: file.size, modified: file.mtimeMs });
            } catch {
                // A concurrent removal does not affect the budget calculation.
            }
        }
        return files;
    }

    private pathFor(key: string): string {
        return join(this.options.directory, `terrain-${key}.bin`);
    }

    private async reject(path: string, type: 'corrupt' | 'invalidate', bytes: number): Promise<undefined> {
        await this.remove(path);
        this.emit(type, bytes);
        return undefined;
    }

    private async remove(path: string): Promise<boolean> {
        this.accessOrder.delete(path);
        try {
            await unlink(path);
            return true;
        } catch {
            return false;
        }
    }

    private touch(path: string): void {
        this.accessOrder.set(path, this.nextAccessOrder);
        this.nextAccessOrder += 1;
    }

    private emit(type: TerrainProtoCacheEvent['type'], bytes?: number): void {
        try {
            this.options.onEvent?.({ type, ...(bytes === undefined ? {} : { bytes }) });
        } catch {
            // Observability hooks must not make world generation fail.
        }
    }
}

/**
 * A value already written in the canonical form {@link fingerprintWorldgenInput} hashes.
 *
 * Hashing one is byte-for-byte hashing the value it came from, so a large input that every key
 * repeats can be written once with {@link canonicalWorldgenInput} and reused.
 */
export class CanonicalWorldgenInput {
    public constructor(public readonly text: string) {}
}

/** Writes JSON values and string-keyed maps in canonical key order to `write`. */
const writeCanonical = (value: unknown, write: (text: string) => void): void => {
    const append = (entry: unknown): void => {
        if (entry instanceof CanonicalWorldgenInput) {
            write(entry.text);
            return;
        }
        if (entry === null) {
            write('null;');
            return;
        }
        if (typeof entry === 'string') {
            write(`string:${JSON.stringify(entry)};`);
            return;
        }
        if (typeof entry === 'boolean') {
            write(entry ? 'boolean:true;' : 'boolean:false;');
            return;
        }
        if (typeof entry === 'number') {
            if (!Number.isFinite(entry)) throw new TypeError('Persistent terrain cache inputs must use finite numbers');
            write(`number:${entry};`);
            return;
        }
        if (Array.isArray(entry)) {
            write('array:[');
            for (const item of entry) append(item);
            write(']array;');
            return;
        }
        if (entry instanceof Map) {
            const entries = [...entry];
            if (entries.some(([key]) => typeof key !== 'string')) {
                throw new TypeError('Persistent terrain cache maps must use string keys');
            }
            write('map:{');
            for (const [key, item] of entries.sort(([left], [right]) => compareStrings(String(left), String(right)))) {
                append(key);
                append(item);
            }
            write('}map;');
            return;
        }
        if (typeof entry === 'object') {
            const prototype = Object.getPrototypeOf(entry);
            if (prototype !== Object.prototype && prototype !== null) {
                throw new TypeError('Persistent terrain cache inputs must use plain objects');
            }
            write('object:{');
            for (const [key, item] of Object.entries(entry).sort(([left], [right]) => compareStrings(left, right))) {
                append(key);
                append(item);
            }
            write('}object;');
            return;
        }

        throw new TypeError('Persistent terrain cache inputs must contain only JSON values and maps');
    };

    append(value);
};

/** Hashes JSON values and string-keyed maps in canonical key order. */
export const fingerprintWorldgenInput = (value: unknown): string => {
    const hash = createHash('sha256');
    writeCanonical(value, (text) => void hash.update(text));
    return hash.digest('hex');
};

/** Writes a value in canonical form once, for reuse inside many {@link fingerprintWorldgenInput} calls. */
export const canonicalWorldgenInput = (value: unknown): CanonicalWorldgenInput => {
    let text = '';
    writeCanonical(value, (piece) => {
        text += piece;
    });
    return new CanonicalWorldgenInput(text);
};

/** Creates a cache key that changes with the record schema, generator version, or status. */
export const terrainProtoCacheKey = (input: unknown): string =>
    fingerprintWorldgenInput({
        schemaVersion: RECORD_SCHEMA_VERSION,
        generatorVersion: GENERATOR_VERSION,
        v8Version: process.versions.v8,
        status: STATUS,
        input
    });

const isCacheKey = (key: string): boolean => /^[a-f0-9]{64}$/.test(key);

const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const isCacheHeader = (value: unknown): value is CacheHeader =>
    typeof value === 'object' &&
    value !== null &&
    'magic' in value &&
    typeof value.magic === 'string' &&
    'schemaVersion' in value &&
    typeof value.schemaVersion === 'number' &&
    'generatorVersion' in value &&
    typeof value.generatorVersion === 'number' &&
    'v8Version' in value &&
    typeof value.v8Version === 'string' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'key' in value &&
    typeof value.key === 'string' &&
    'payloadDigest' in value &&
    typeof value.payloadDigest === 'string';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isStringRecord = (value: unknown): value is Record<string, string> =>
    isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');

const isGenerationRegionPayload = (value: unknown): value is GenerationRegionPayload => {
    if (
        !isRecord(value) ||
        typeof value.chunkX !== 'number' ||
        !Number.isSafeInteger(value.chunkX) ||
        typeof value.chunkZ !== 'number' ||
        !Number.isSafeInteger(value.chunkZ) ||
        typeof value.minY !== 'number' ||
        !Number.isSafeInteger(value.minY) ||
        typeof value.height !== 'number' ||
        !Number.isSafeInteger(value.height) ||
        value.height === 0 ||
        Math.abs(value.height) > 4096 ||
        value.radius !== 0 ||
        !Array.isArray(value.palette) ||
        value.palette.length < 1 ||
        value.palette.length > 65536 ||
        !(value.states instanceof ArrayBuffer) ||
        !(value.highest instanceof ArrayBuffer) ||
        !Array.isArray(value.blockEntities) ||
        !Array.isArray(value.entitySpawns)
    ) {
        return false;
    }

    const volume = 16 * 16 * Math.abs(value.height);
    if (value.states.byteLength !== volume * Uint16Array.BYTES_PER_ELEMENT) return false;
    if (value.highest.byteLength !== 16 * 16 * Int32Array.BYTES_PER_ELEMENT) return false;
    if (value.frozenSurface !== undefined && !(value.frozenSurface instanceof ArrayBuffer)) return false;
    if (value.biomeSections !== undefined && !(value.biomeSections instanceof ArrayBuffer)) return false;
    if (value.biomeSectionOffsets !== undefined && !(value.biomeSectionOffsets instanceof ArrayBuffer)) return false;
    if ((value.biomeSections === undefined) !== (value.biomeSectionOffsets === undefined)) return false;

    return value.palette.every(
        (entry) =>
            isRecord(entry) &&
            isRecord(entry.java) &&
            typeof entry.java.name === 'string' &&
            isStringRecord(entry.java.properties)
    );
};

const matchesIdentity = (payload: GenerationRegionPayload, expected: TerrainProtoIdentity): boolean =>
    payload.chunkX === expected.chunkX &&
    payload.chunkZ === expected.chunkZ &&
    payload.minY === expected.minY &&
    payload.height === expected.height;
