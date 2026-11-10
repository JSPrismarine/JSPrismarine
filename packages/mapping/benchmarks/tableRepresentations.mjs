import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const assets = [
    { name: 'mapping/blocks', file: 'packages/mapping/src/tables/blocks.json' },
    { name: 'mapping/blockStates', file: 'packages/mapping/src/tables/blockStates.json' },
    { name: 'mapping/blockProperties', file: 'packages/mapping/src/tables/blockProperties.json' },
    { name: 'mapping/items', file: 'packages/mapping/src/tables/items.json' },
    { name: 'mapping/entities', file: 'packages/mapping/src/tables/entities.json' },
    { name: 'mapping/registries', file: 'packages/mapping/src/tables/registries.json' },
    { name: 'mapping/javaIdentifiers', file: 'packages/mapping/src/tables/javaIdentifiers.json' },
    { name: 'mapping/dimensions', file: 'packages/mapping/src/tables/dimensions.json' },
    { name: 'blocks/geometry', file: 'packages/blocks/src/tables/blockGeometry.json', nativeInCurrent: true },
    { name: 'items/itemTypes', file: 'packages/items/src/tables/itemTypes.json', nativeInCurrent: true }
];

const HEADER_BYTES = 28;
const UINT32_MAX = 0xffffffff;
const NODE = { null: 0, false: 1, true: 2, number: 3, string: 4, array: 5, object: 6 };
const decoder = new TextDecoder();

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
const assetPath = (asset) => path.join(root, asset.file);

const bundleFrom = (values) => Object.fromEntries(values.map(([name, value]) => [name, value]));

const rowQueriesOf = (bundle) => {
    const queries = [];
    for (const [assetName, document] of Object.entries(bundle)) {
        for (const [section, rows] of Object.entries(document)) {
            if (rows === null || typeof rows !== 'object' || Array.isArray(rows)) continue;
            for (const id of Object.keys(rows)) queries.push({ asset: assetName, section, id });
        }
    }
    return queries;
};

const rowOf = (bundle, query) => bundle[query.asset]?.[query.section]?.[query.id];

/** Rebuilds a JSON tree while routing equal string values and keys through one pool entry. */
const internStrings = (value, pool) => {
    if (typeof value === 'string') {
        if (pool.has(value)) return pool.get(value);
        pool.set(value, value);
        return value;
    }
    if (Array.isArray(value)) return value.map((entry) => internStrings(entry, pool));
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [internStrings(key, pool), internStrings(entry, pool)])
    );
};

/** Encodes an ordered JSON bundle as versioned, interned string and typed-value columns. */
const encodeBinaryBundle = (bundle) => {
    const strings = [];
    const stringIds = new Map();
    const kinds = [];
    const numbers = [];
    const stringRefs = [];
    const firstChildren = [];
    const childCounts = [];
    const edgeValues = [];
    const edgeKeys = [];
    const objectChildren = new WeakMap();

    const intern = (value) => {
        const found = stringIds.get(value);
        if (found !== undefined) return found;
        const index = strings.length;
        strings.push(value);
        stringIds.set(value, index);
        return index;
    };

    const encodeNode = (value) => {
        const node = kinds.length;
        kinds.push(NODE.null);
        numbers.push(0);
        stringRefs.push(UINT32_MAX);
        firstChildren.push(0);
        childCounts.push(0);

        if (value === null) return node;
        if (value === false) {
            kinds[node] = NODE.false;
            return node;
        }
        if (value === true) {
            kinds[node] = NODE.true;
            return node;
        }
        if (typeof value === 'number') {
            kinds[node] = NODE.number;
            numbers[node] = value;
            return node;
        }
        if (typeof value === 'string') {
            kinds[node] = NODE.string;
            stringRefs[node] = intern(value);
            return node;
        }

        const entries = Array.isArray(value)
            ? value.map((entry, index) => [String(index), entry])
            : Object.entries(value);
        kinds[node] = Array.isArray(value) ? NODE.array : NODE.object;
        firstChildren[node] = edgeValues.length;
        const children = new Map();
        for (const [key] of entries) {
            edgeValues.push(0);
            edgeKeys.push(Array.isArray(value) ? UINT32_MAX : intern(key));
        }
        for (let index = 0; index < entries.length; index += 1) {
            const [key, entry] = entries[index];
            const child = encodeNode(entry);
            edgeValues[firstChildren[node] + index] = child;
            children.set(key, child);
        }
        childCounts[node] = entries.length;
        if (!Array.isArray(value)) objectChildren.set(value, children);
        return node;
    };

    encodeNode(bundle);

    const rowTables = [];
    const rowIdentifiers = [];
    const rowNodes = [];
    for (const [assetName, document] of Object.entries(bundle)) {
        for (const [section, rows] of Object.entries(document)) {
            if (rows === null || typeof rows !== 'object' || Array.isArray(rows)) continue;
            const childNodes = objectChildren.get(rows);
            for (const id of Object.keys(rows)) {
                rowTables.push(intern(`${assetName}:${section}`));
                rowIdentifiers.push(intern(id));
                rowNodes.push(childNodes.get(id));
            }
        }
    }

    const encodedStrings = strings.map((value) => Buffer.from(value, 'utf8'));
    const stringBytes = Buffer.concat(encodedStrings);
    const stringOffsets = Buffer.alloc(strings.length * 4);
    const stringLengths = Buffer.alloc(strings.length * 4);
    let stringOffset = 0;
    for (let index = 0; index < encodedStrings.length; index += 1) {
        const bytes = encodedStrings[index];
        stringOffsets.writeUInt32LE(stringOffset, index * 4);
        stringLengths.writeUInt32LE(bytes.length, index * 4);
        stringOffset += bytes.length;
    }

    const writeU32Column = (values) => {
        const column = Buffer.alloc(values.length * 4);
        for (let index = 0; index < values.length; index += 1) column.writeUInt32LE(values[index], index * 4);
        return column;
    };
    const numberColumn = Buffer.alloc(numbers.length * 8);
    for (let index = 0; index < numbers.length; index += 1) numberColumn.writeDoubleLE(numbers[index], index * 8);

    const header = Buffer.alloc(HEADER_BYTES);
    header.write('JSPT', 0, 'ascii');
    header.writeUInt32LE(1, 4);
    header.writeUInt32LE(strings.length, 8);
    header.writeUInt32LE(kinds.length, 12);
    header.writeUInt32LE(edgeValues.length, 16);
    header.writeUInt32LE(rowNodes.length, 20);
    header.writeUInt32LE(stringBytes.length, 24);

    return Buffer.concat([
        header,
        stringOffsets,
        stringLengths,
        stringBytes,
        Buffer.from(kinds),
        numberColumn,
        writeU32Column(stringRefs),
        writeU32Column(firstChildren),
        writeU32Column(childCounts),
        writeU32Column(edgeValues),
        writeU32Column(edgeKeys),
        writeU32Column(rowTables),
        writeU32Column(rowIdentifiers),
        writeU32Column(rowNodes)
    ]);
};

/** Opens the prototype format with lazy row decoding and identifier indexes. */
const openBinaryBundle = (input) => {
    const bytes = Uint8Array.from(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (decoder.decode(bytes.subarray(0, 4)) !== 'JSPT') throw new Error('Invalid binary table magic');
    const version = view.getUint32(4, true);
    if (version !== 1) throw new Error(`Unsupported binary table version ${version}`);

    const stringCount = view.getUint32(8, true);
    const nodeCount = view.getUint32(12, true);
    const edgeCount = view.getUint32(16, true);
    const rowCount = view.getUint32(20, true);
    const stringByteCount = view.getUint32(24, true);
    let offset = HEADER_BYTES;
    const readU32Column = (length) => {
        const values = new Uint32Array(length);
        for (let index = 0; index < length; index += 1) values[index] = view.getUint32(offset + index * 4, true);
        offset += length * 4;
        return values;
    };
    const stringOffsets = readU32Column(stringCount);
    const stringLengths = readU32Column(stringCount);
    const stringData = Uint8Array.from(bytes.subarray(offset, offset + stringByteCount));
    offset += stringByteCount;
    const kinds = Uint8Array.from(bytes.subarray(offset, offset + nodeCount));
    offset += nodeCount;
    const numbers = new Float64Array(nodeCount);
    for (let index = 0; index < nodeCount; index += 1) numbers[index] = view.getFloat64(offset + index * 8, true);
    offset += nodeCount * 8;
    const stringRefs = readU32Column(nodeCount);
    const firstChildren = readU32Column(nodeCount);
    const childCounts = readU32Column(nodeCount);
    const edgeValues = readU32Column(edgeCount);
    const edgeKeys = readU32Column(edgeCount);
    const rowTables = readU32Column(rowCount);
    const rowIdentifiers = readU32Column(rowCount);
    const rowNodes = readU32Column(rowCount);
    if (offset !== bytes.length) throw new Error('Binary table has trailing or truncated bytes');

    const stringCache = new Map();
    const getString = (index) => {
        let value = stringCache.get(index);
        if (value === undefined) {
            value = decoder.decode(
                stringData.subarray(stringOffsets[index], stringOffsets[index] + stringLengths[index])
            );
            stringCache.set(index, value);
        }
        return value;
    };
    const rowIndexes = new Map();
    for (let index = 0; index < rowCount; index += 1) {
        const table = getString(rowTables[index]);
        let rows = rowIndexes.get(table);
        if (rows === undefined) {
            rows = new Map();
            rowIndexes.set(table, rows);
        }
        rows.set(getString(rowIdentifiers[index]), rowNodes[index]);
    }

    const rowCache = new Map();
    const decodeNode = (node) => {
        switch (kinds[node]) {
            case NODE.null:
                return null;
            case NODE.false:
                return false;
            case NODE.true:
                return true;
            case NODE.number:
                return numbers[node];
            case NODE.string:
                return getString(stringRefs[node]);
            case NODE.array: {
                const first = firstChildren[node];
                return Array.from({ length: childCounts[node] }, (_, index) => decodeNode(edgeValues[first + index]));
            }
            case NODE.object: {
                const first = firstChildren[node];
                const entries = Array.from({ length: childCounts[node] }, (_, index) => {
                    const edge = first + index;
                    return [getString(edgeKeys[edge]), decodeNode(edgeValues[edge])];
                });
                return Object.fromEntries(entries);
            }
            default:
                throw new Error(`Invalid binary node kind ${kinds[node]}`);
        }
    };

    return {
        getRow(asset, section, id) {
            const node = rowIndexes.get(`${asset}:${section}`)?.get(id);
            if (node === undefined) return undefined;
            if (!rowCache.has(node)) rowCache.set(node, decodeNode(node));
            return rowCache.get(node);
        },
        decodeAll: () => decodeNode(0),
        indexedRows: rowCount
    };
};

const readJsonBundle = () =>
    bundleFrom(assets.map((asset) => [asset.name, JSON.parse(readFileSync(assetPath(asset), 'utf8'))]));

const loadJsonModules = async (assetList) =>
    bundleFrom(
        await Promise.all(
            assetList.map(async (asset) => [
                asset.name,
                (await import(pathToFileURL(asset.path).href, { with: { type: 'json' } })).default
            ])
        )
    );

const loadCurrentBundle = async (assetList, literalPath) => {
    const literal = (await import(pathToFileURL(literalPath).href)).default;
    const external = assetList.filter((asset) => asset.nativeInCurrent);
    return bundleFrom([
        ...Object.entries(literal),
        ...(await Promise.all(
            external.map(async (asset) => [
                asset.name,
                (await import(pathToFileURL(asset.path).href, { with: { type: 'json' } })).default
            ])
        ))
    ]);
};

if (process.argv[2] === '--child') {
    const [mode, manifestPath] = process.argv.slice(3);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    globalThis.gc();
    const before = process.memoryUsage();
    const cpuStart = process.cpuUsage();
    const timeStart = performance.now();
    let bundle;
    let binary;
    if (mode === 'current') bundle = await loadCurrentBundle(manifest.assets, manifest.literalPath);
    else if (mode === 'native') bundle = await loadJsonModules(manifest.assets);
    else if (mode === 'interned') {
        const source = readJsonBundle();
        const pool = new Map();
        bundle = internStrings(source, pool);
        pool.clear();
    } else if (mode === 'binary') {
        binary = openBinaryBundle(readFileSync(manifest.binaryPath));
    } else throw new Error(`Unknown table representation: ${mode}`);
    const startupMs = performance.now() - timeStart;
    const startupCpu = process.cpuUsage(cpuStart);
    globalThis.gc();
    const retained = process.memoryUsage();

    const queries = JSON.parse(readFileSync(manifest.queriesPath, 'utf8'));
    const lookup = (query) =>
        binary === undefined ? rowOf(bundle, query) : binary.getRow(query.asset, query.section, query.id);
    const common = queries.slice(0, Math.min(12, queries.length));
    const commonKey = new Set(common.map((query) => `${query.asset}:${query.section}:${query.id}`));
    const hotStart = process.hrtime.bigint();
    let hits = 0;
    for (let repeat = 0; repeat < 10_000; repeat += 1) {
        for (const query of common) if (lookup(query) !== undefined) hits += 1;
    }
    const hotLookupNs = Number(process.hrtime.bigint() - hotStart) / (10_000 * common.length);

    const coldQueries = queries.filter((query) => !commonKey.has(`${query.asset}:${query.section}:${query.id}`));
    const coldStart = process.hrtime.bigint();
    for (const query of coldQueries) {
        if (lookup(query) === undefined) throw new Error(`Missing row ${query.asset}:${query.section}:${query.id}`);
        hits += 1;
    }
    const coldLookupNs =
        coldQueries.length === 0 ? 0 : Number(process.hrtime.bigint() - coldStart) / coldQueries.length;

    const lookupDigest = digest(queries.map(lookup));
    assert.equal(lookupDigest, manifest.expectedRowsDigest, `${mode} lookup rows preserve the JSON data`);
    process.stdout.write(
        `${JSON.stringify({
            mode,
            lookupDigest,
            hits,
            startupMs,
            startupCpuMs: (startupCpu.user + startupCpu.system) / 1000,
            retainedHeapBytes: retained.heapUsed - before.heapUsed,
            retainedArrayBufferBytes: retained.arrayBuffers - before.arrayBuffers,
            retainedRssBytes: retained.rss - before.rss,
            hotLookupNs,
            coldLookupNs
        })}\n`
    );
} else {
    const args = process.argv.slice(2).filter((argument) => argument !== '--');
    const verifyOnly = args.includes('--verify');
    const roundsAt = args.indexOf('--rounds');
    const rounds = roundsAt < 0 ? 5 : Number(args[roundsAt + 1]);
    if (!verifyOnly && (!Number.isInteger(rounds) || rounds < 1)) {
        throw new Error('Usage: tableRepresentations.mjs [--rounds <positive-integer>] [--verify]');
    }

    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-table-format-'));
    try {
        const sourceBundle = readJsonBundle();
        const sourceDigest = digest(sourceBundle);
        const queries = rowQueriesOf(sourceBundle);
        const expectedRowsDigest = digest(queries.map((query) => rowOf(sourceBundle, query)));
        const literalAssets = Object.fromEntries(
            assets.filter((asset) => !asset.nativeInCurrent).map((asset) => [asset.name, sourceBundle[asset.name]])
        );
        const literalPath = path.join(temporaryRoot, 'current-mapping-tables.mjs');
        const binaryPath = path.join(temporaryRoot, 'tables.v1.bin');
        const queriesPath = path.join(temporaryRoot, 'lookup-queries.json');
        const manifestPath = path.join(temporaryRoot, 'manifest.json');
        writeFileSync(literalPath, `export default ${JSON.stringify(literalAssets)};\n`);
        writeFileSync(queriesPath, JSON.stringify(queries));

        const binaryBytes = encodeBinaryBundle(sourceBundle);
        assert.deepEqual(binaryBytes, encodeBinaryBundle(sourceBundle), 'binary generation is deterministic');
        writeFileSync(binaryPath, binaryBytes);
        const binary = openBinaryBundle(binaryBytes);
        assert.equal(binary.indexedRows, queries.length, 'binary row index covers every identifier row');
        assert.equal(digest(binary.decodeAll()), sourceDigest, 'binary decoding preserves every value and row order');
        for (const query of queries) {
            assert.deepEqual(binary.getRow(query.asset, query.section, query.id), rowOf(sourceBundle, query));
        }

        const nativeBundle = await loadJsonModules(assets.map((asset) => ({ ...asset, path: assetPath(asset) })));
        const currentBundle = await loadCurrentBundle(
            assets.map((asset) => ({ ...asset, path: assetPath(asset) })),
            literalPath
        );
        const pool = new Map();
        const internedBundle = internStrings(sourceBundle, pool);
        pool.clear();
        assert.equal(digest(nativeBundle), sourceDigest, 'native JSON modules preserve every source table');
        assert.equal(
            digest(currentBundle),
            sourceDigest,
            'current package representation preserves every source table'
        );
        assert.equal(digest(internedBundle), sourceDigest, 'string interning preserves every source table');

        const manifest = {
            assets: assets.map((asset) => ({ ...asset, path: assetPath(asset) })),
            literalPath,
            binaryPath,
            queriesPath,
            expectedRowsDigest
        };
        writeFileSync(manifestPath, JSON.stringify(manifest));

        process.stdout.write(
            `Verified ${assets.length} JSON inputs, ${queries.length} identifier rows, and ordered digest ${sourceDigest}. ` +
                `Deterministic v1 binary: ${binaryBytes.length} bytes; JSON source: ${assets.reduce((sum, asset) => sum + statSync(assetPath(asset)).size, 0)} bytes.\n`
        );
        if (!verifyOnly) {
            const modes = ['current', 'native', 'interned', 'binary'];
            const samples = Object.fromEntries(modes.map((mode) => [mode, []]));
            for (let round = 0; round < rounds; round += 1) {
                const order = [...modes.slice(round % modes.length), ...modes.slice(0, round % modes.length)];
                for (const mode of order) {
                    const report = JSON.parse(
                        execFileSync(
                            process.execPath,
                            ['--expose-gc', import.meta.filename, '--child', mode, manifestPath],
                            {
                                encoding: 'utf8'
                            }
                        )
                    );
                    samples[mode].push(report);
                }
            }

            const reports = modes.map((mode) => {
                const rows = samples[mode];
                assert(
                    rows.every((row) => row.lookupDigest === expectedRowsDigest),
                    `${mode} lookup digest is stable`
                );
                const medianOf = (key) => median(rows.map((row) => row[key]));
                return {
                    representation: mode,
                    medianStartupMs: medianOf('startupMs'),
                    medianStartupCpuMs: medianOf('startupCpuMs'),
                    medianRetainedHeapBytes: medianOf('retainedHeapBytes'),
                    medianRetainedArrayBufferBytes: medianOf('retainedArrayBufferBytes'),
                    medianRetainedRssBytes: medianOf('retainedRssBytes'),
                    medianHotLookupNs: medianOf('hotLookupNs'),
                    medianColdLookupNs: medianOf('coldLookupNs')
                };
            });
            process.stdout.write(
                `${JSON.stringify({ rounds, sourceDigest, sourceBytes: assets.reduce((sum, asset) => sum + statSync(assetPath(asset)).size, 0), binaryBytes: binaryBytes.length, rows: queries.length, results: reports }, null, 4)}\n`
            );
        }
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
}
