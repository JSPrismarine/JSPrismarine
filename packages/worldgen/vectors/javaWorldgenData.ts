import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

import { WorldgenData } from '../src/WorldgenData';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    localHeaderOffset: number;
}

/**
 * Lists the entries of a zip through its end-of-central-directory record.
 *
 * The jar is untrusted downloaded data, so nothing here writes to disk and nothing resolves an
 * entry name against the file system; entries are read straight into memory.
 */
const readCentralDirectory = (buffer: Buffer): ZipEntry[] => {
    let end = -1;
    const earliest = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= earliest; i--) {
        if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error('Not a zip file: no end of central directory record');

    const entryCount = buffer.readUInt16LE(end + 10);
    const centralOffset = buffer.readUInt32LE(end + 16);
    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
        throw new Error('Zip64 archives are not supported by this reader');
    }

    const entries: ZipEntry[] = [];
    let offset = centralOffset;
    for (let i = 0; i < entryCount; i++) {
        if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) throw new Error('Corrupt zip: bad central header');
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
        entries.push({ name, method, compressedSize, localHeaderOffset });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
};

const readEntry = (buffer: Buffer, entry: ZipEntry): Buffer => {
    if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER) {
        throw new Error(`Corrupt zip: bad local header for ${entry.name}`);
    }
    const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const start = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return inflateRawSync(compressed);
    throw new Error(`${entry.name} uses zip compression method ${entry.method}`);
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');

const innerJarPath = (): string | undefined => {
    const override = process.env['JSP_JAVA_SERVER_JAR'];
    if (override) return existsSync(override) ? override : undefined;

    const sourcesPath = join(repoRoot, 'packages/bedrock-data/sources.json');
    if (!existsSync(sourcesPath)) return undefined;
    // sources.json is parsed JSON; only the pinned version is read.
    const sources = JSON.parse(readFileSync(sourcesPath, 'utf8')) as { javaServer: { version: string } };
    const version = sources.javaServer.version;
    const path = join(
        repoRoot,
        'node_modules/.cache/jsprismarine/java',
        version,
        'extracted/META-INF/versions',
        version,
        `server-${version}.jar`
    );
    return existsSync(path) ? path : undefined;
};

const REGISTRY_PREFIX = 'data/minecraft/worldgen/';

/** The counts a coverage test reports alongside the parsed registries. */
export interface VanillaWorldgenData {
    /** The parsed registries, ready to resolve references. */
    readonly data: WorldgenData;
    /** How many `worldgen/density_function` files the jar holds. */
    readonly densityFunctionCount: number;
    /** How many `worldgen/noise` files the jar holds. */
    readonly noiseCount: number;
    /** How many `worldgen/noise_settings` files the jar holds. */
    readonly noiseSettingsCount: number;
}

/**
 * Loads the real vanilla worldgen registries out of the pinned Java Edition server jar.
 */
export const loadVanillaWorldgenData = (): VanillaWorldgenData | undefined => {
    const jar = innerJarPath();
    if (!jar) {
        throw new Error(
            'The pinned Java server jar is not unpacked. Run ' +
                '`pnpm --filter @jsprismarine/bedrock-data run dump:java` or point JSP_JAVA_SERVER_JAR at one.'
        );
    }

    const buffer = readFileSync(jar);
    const densityFunctions = new Map<string, unknown>();
    const noises = new Map<string, unknown>();
    const noiseSettings = new Map<string, unknown>();
    const targets: Record<string, Map<string, unknown>> = {
        density_function: densityFunctions,
        noise: noises,
        noise_settings: noiseSettings
    };

    for (const entry of readCentralDirectory(buffer)) {
        if (!entry.name.startsWith(REGISTRY_PREFIX) || !entry.name.endsWith('.json')) continue;
        const rest = entry.name.slice(REGISTRY_PREFIX.length);
        const slash = rest.indexOf('/');
        const registry = rest.slice(0, slash);
        const target = targets[registry];
        if (!target) continue;
        const id = `minecraft:${rest.slice(slash + 1, -'.json'.length)}`;
        // Extracted game files are untrusted data; this only parses them as JSON.
        target.set(id, JSON.parse(readEntry(buffer, entry).toString('utf8')));
    }

    return {
        data: new WorldgenData({ densityFunctions, noises, noiseSettings }),
        densityFunctionCount: densityFunctions.size,
        noiseCount: noises.size,
        noiseSettingsCount: noiseSettings.size
    };
};
