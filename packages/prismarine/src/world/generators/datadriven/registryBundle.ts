/**
 * The Java world generation registries as one buffer, so several threads can share the bytes.
 *
 * A worker that reads the 1514 documents off disk for itself spends 430 to 573 ms doing it, and
 * eight workers doing it at once spend 540 ms of wall clock between them. The same eight reach
 * parsed registries in 75 ms from one 2.66 MiB buffer of UTF-8 JSON, because the bytes exist once
 * and each worker pays only for `TextDecoder` and `JSON.parse`. Passing the parsed object graph
 * through `workerData` is the option to avoid: the structured clone runs on the spawning thread,
 * which is the 289 ms this design exists to keep off the main thread.
 *
 * Nothing above the parse is shareable. A V8 heap is per isolate, so every worker rebuilds the
 * density graph, the noise tables and the biome source out of these documents for itself.
 *
 * The buffer may be an `ArrayBuffer` or a `SharedArrayBuffer` and the reader does not care, which
 * is what lets one bundle be posted to every worker as a handle rather than copied to each.
 *
 * The layout is a header, an index and the documents:
 *
 * | Bytes | What |
 * | --- | --- |
 * | 0 to 3 | `JPRB`, little-endian |
 * | 4 to 7 | the format version |
 * | 8 to 11 | how many bytes the index holds |
 * | 12 onward | the index, as UTF-8 JSON |
 * | after the index | every document's UTF-8 JSON, end to end |
 */
import type { JavaRegistry, JavaWorldgenRegistries } from './javaWorldgenData';

/** `JPRB`, so a buffer that is not a bundle says so rather than being parsed as one. */
const MAGIC = 0x4a505242;

/** Bumped when the header or the index shape changes. */
const FORMAT_VERSION = 1;

/** Magic, version and index length, each a little-endian `Uint32`. */
const HEADER_BYTES = 12;

/**
 * The registries a bundle carries, in the order it writes them.
 *
 * `satisfies` keeps a typo or a registry that no longer exists out of the list, and the reader's
 * return statement names every field of {@link JavaWorldgenRegistries} through a function that
 * only takes a member of this list, which is what keeps a newly added registry from being left
 * out of every worker's copy.
 */
const BUNDLED_REGISTRIES = [
    'densityFunctions',
    'noises',
    'noiseSettings',
    'materialRules',
    'materialConditions',
    'carvers',
    'biomes',
    'features',
    'placedFeatures',
    'blockStateProviders',
    'processorLists',
    'structures',
    'structureSets',
    'templatePools',
    'blockTags',
    'biomeTags',
    'biomeParameters'
] as const satisfies ReadonlyArray<keyof JavaWorldgenRegistries>;

/** One registry a bundle carries. */
type BundledRegistry = (typeof BUNDLED_REGISTRIES)[number];

/** One document's place in the bundle: its identifier, its byte offset and its byte length. */
type BundleEntry = readonly [id: string, byteOffset: number, byteLength: number];

/** The index, itself UTF-8 JSON, sitting between the header and the documents. */
interface BundleIndex {
    readonly registries: ReadonlyArray<readonly [registry: string, entries: readonly BundleEntry[]]>;
}

/** Raised when a buffer handed to {@link readRegistryBundle} is not a bundle this build reads. */
export class RegistryBundleFormatError extends Error {
    public override name = 'RegistryBundleFormatError';

    public constructor(what: string) {
        super(`This is not a world generation registry bundle this build reads: ${what}.`);
    }
}

/**
 * Packs the registries into one buffer of UTF-8 JSON.
 *
 * @param registries - The registries as a thread already holds them, so building the bundle does
 * not read the 1514 files a second time.
 * @returns The bundle. {@link shareRegistryBundle} is the same thing in shared memory.
 */
export const buildRegistryBundle = (registries: JavaWorldgenRegistries): ArrayBuffer => {
    const encoder = new TextEncoder();
    const documents: Uint8Array[] = [];
    const index: Array<readonly [string, BundleEntry[]]> = [];

    let offset = 0;
    for (const registry of BUNDLED_REGISTRIES) {
        const entries: BundleEntry[] = [];
        for (const [id, document] of registries[registry]) {
            const bytes = encoder.encode(JSON.stringify(document));
            entries.push([id, offset, bytes.byteLength]);
            documents.push(bytes);
            offset += bytes.byteLength;
        }
        index.push([registry, entries]);
    }

    const indexBytes = encoder.encode(JSON.stringify({ registries: index } satisfies BundleIndex));
    const buffer = new ArrayBuffer(HEADER_BYTES + indexBytes.byteLength + offset);
    const header = new DataView(buffer);
    header.setUint32(0, MAGIC, true);
    header.setUint32(4, FORMAT_VERSION, true);
    header.setUint32(8, indexBytes.byteLength, true);

    const bytes = new Uint8Array(buffer);
    bytes.set(indexBytes, HEADER_BYTES);

    let at = HEADER_BYTES + indexBytes.byteLength;
    for (const document of documents) {
        bytes.set(document, at);
        at += document.byteLength;
    }

    return buffer;
};

/**
 * Packs the registries into shared memory, which is how a worker pool is handed its data.
 *
 * @param registries - The registries as the spawning thread already holds them.
 * @returns A buffer every worker maps rather than copies. The handle costs the same to post as a
 * sixteen byte message, so the bytes are paid for once however many workers read them.
 */
export const shareRegistryBundle = (registries: JavaWorldgenRegistries): SharedArrayBuffer => {
    const bundle = buildRegistryBundle(registries);
    const shared = new SharedArrayBuffer(bundle.byteLength);
    new Uint8Array(shared).set(new Uint8Array(bundle));
    return shared;
};

/**
 * Reads a bundle back into the registries.
 *
 * @param bundle - The bytes {@link buildRegistryBundle} wrote, as an `ArrayBuffer` or as the
 * `SharedArrayBuffer` several workers hold a handle on.
 * @returns The registries, document for document what the loader read off disk.
 * @throws RegistryBundleFormatError when the buffer is shorter than a header, does not carry the
 * magic, carries a format version this build does not read, or names a document past its end.
 */
export const readRegistryBundle = (bundle: ArrayBufferLike): JavaWorldgenRegistries => {
    if (bundle.byteLength < HEADER_BYTES) throw new RegistryBundleFormatError('it is shorter than a header');

    const header = new DataView(bundle);
    if (header.getUint32(0, true) !== MAGIC) throw new RegistryBundleFormatError('it does not start with JPRB');

    const version = header.getUint32(4, true);
    if (version !== FORMAT_VERSION) {
        throw new RegistryBundleFormatError(`it is format version ${version} and this build reads ${FORMAT_VERSION}`);
    }

    const documentsAt = HEADER_BYTES + header.getUint32(8, true);
    if (bundle.byteLength < documentsAt) throw new RegistryBundleFormatError('its index runs past the end');

    const decoder = new TextDecoder();
    const all = new Uint8Array(bundle);
    // The server's own bytes rather than extracted game data, and parsed rather than executed all
    // the same.
    const index: BundleIndex = JSON.parse(decoder.decode(all.subarray(HEADER_BYTES, documentsAt)));

    const read = new Map<string, JavaRegistry>();
    for (const [registry, entries] of index.registries) {
        const documents = new Map<string, unknown>();
        for (const [id, offset, length] of entries) {
            const from = documentsAt + offset;
            if (from + length > bundle.byteLength) {
                throw new RegistryBundleFormatError(`the document ${id} runs past the end`);
            }

            documents.set(id, JSON.parse(decoder.decode(all.subarray(from, from + length))));
        }
        read.set(registry, documents);
    }

    const registryOf = (name: BundledRegistry): JavaRegistry => read.get(name) ?? new Map();
    return {
        densityFunctions: registryOf('densityFunctions'),
        noises: registryOf('noises'),
        noiseSettings: registryOf('noiseSettings'),
        materialRules: registryOf('materialRules'),
        materialConditions: registryOf('materialConditions'),
        carvers: registryOf('carvers'),
        biomes: registryOf('biomes'),
        features: registryOf('features'),
        placedFeatures: registryOf('placedFeatures'),
        blockStateProviders: registryOf('blockStateProviders'),
        processorLists: registryOf('processorLists'),
        structures: registryOf('structures'),
        structureSets: registryOf('structureSets'),
        templatePools: registryOf('templatePools'),
        blockTags: registryOf('blockTags'),
        biomeTags: registryOf('biomeTags'),
        biomeParameters: registryOf('biomeParameters')
    };
};
