/**
 * Measures full-corpus Java template decoding per worker against one shared decoded payload.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:template-decode`. This deliberately
 * decodes every template in each worker: normal generation is lazy, so the result is an upper
 * bound for a worker that eventually touches the complete corpus.
 *
 * The decoded transport modes are assessment probes, not production paths. Both native structured
 * clone and V8 serialization drop NBT tag prototypes; timings alone cannot make those payloads
 * safe for template processors or block-entity placement.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import type { JavaStructureTemplate } from '@jsprismarine/structures';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { readJavaStructureTemplate } from '@jsprismarine/structures';

import { javaTemplateDirectory } from '../src/world/generators/datadriven/javaStructureTemplates';

interface TemplateFile {
    readonly id: string;
    readonly path: string;
}

interface WorkerSample {
    readonly mode: 'decode' | 'cloned-decoded' | 'shared-decoded';
    readonly fileReadCpuMs: number;
    readonly decodeCpuMs: number;
    readonly deserializeCpuMs: number;
    readonly workerCpuMs: number;
    readonly workerWorkMs: number;
    readonly templateCount: number;
    readonly blockCount: number;
    readonly paletteCount: number;
    readonly nbtTemplateCount: number;
    readonly nbtPrototypePreserved: boolean;
}

interface WorkerMeasurement extends WorkerSample {
    readonly parallelWallMs: number;
    readonly setupWallMs: number;
    readonly setupCpuMs: number;
}

interface WorkerReply {
    readonly measurement: WorkerSample;
}

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');
const templateRoot = javaTemplateDirectory(cacheRoot);
if (templateRoot === undefined) {
    throw new Error(
        'Java structure templates are unavailable; run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`.'
    );
}

const files = templateFiles(templateRoot);
if (files.length === 0) throw new Error(`No .nbt templates found under ${templateRoot}`);

const mainReadStarted = performance.now();
const mainReadCpuStarted = process.threadCpuUsage();
const raw = new Map(files.map(({ id, path }) => [id, readFileSync(path)]));
const mainReadMs = performance.now() - mainReadStarted;
const mainReadCpuMs = cpuMilliseconds(process.threadCpuUsage(mainReadCpuStarted));
const rawBytes = [...raw.values()].reduce((total, bytes) => total + bytes.byteLength, 0);
const mainDecodeStarted = performance.now();
const decodeCpuStarted = process.threadCpuUsage();
const decoded = new Map<string, JavaStructureTemplate>();
for (const [id, bytes] of raw) decoded.set(id, readJavaStructureTemplate(bytes));
const mainDecodeMs = performance.now() - mainDecodeStarted;
const mainDecodeCpuMs = cpuMilliseconds(process.threadCpuUsage(decodeCpuStarted));

const encodeStarted = performance.now();
const encodeCpuStarted = process.threadCpuUsage();
const encoded = serialize(decoded);
const encodeCpuMs = cpuMilliseconds(process.threadCpuUsage(encodeCpuStarted));
const encodeMs = performance.now() - encodeStarted;
const sharedPayload = new SharedArrayBuffer(encoded.byteLength);
const sharedCopyStarted = performance.now();
const sharedCopyCpuStarted = process.threadCpuUsage();
new Uint8Array(sharedPayload).set(encoded);
const sharedCopyMs = performance.now() - sharedCopyStarted;
const sharedCopyCpuMs = cpuMilliseconds(process.threadCpuUsage(sharedCopyCpuStarted));

const validation = validateTransports(decoded, sharedPayload);
const nbtTemplate = firstNbtTemplate(decoded);
const nbtPrototypePreserved = nbtTemplate === undefined || nbtTemplate instanceof NBTTagCompound;

const workerCounts = parseCounts(process.env.JSP_TEMPLATE_WORKER_COUNTS ?? '1,2,4,8');
const samples = parsePositiveInteger(process.env.JSP_TEMPLATE_WORKER_SAMPLES ?? '3');
const results: Array<{
    mode: WorkerMeasurement['mode'];
    workerCount: number;
    samples: WorkerMeasurement[];
}> = [];

for (const workerCount of workerCounts) {
    for (const mode of ['decode', 'cloned-decoded', 'shared-decoded'] as const) {
        const measurements: WorkerMeasurement[] = [];
        for (let sample = 0; sample < samples; sample++) {
            const workerStarted = performance.now();
            const setupStarted = performance.now();
            const setupCpuStarted = process.threadCpuUsage();
            const workers = Array.from({ length: workerCount }, () => runWorker(mode, files, sharedPayload, decoded));
            const setupWallMs = performance.now() - setupStarted;
            const setupCpuMs = cpuMilliseconds(process.threadCpuUsage(setupCpuStarted));
            const workerMeasurements = await Promise.all(workers);
            const workerWallMs = performance.now() - workerStarted;
            assertSummaryMatches(workerMeasurements, mode, workerCount, sample + 1);

            measurements.push(combineMeasurements(mode, workerMeasurements, workerWallMs, setupWallMs, setupCpuMs));
        }
        results.push({ mode, workerCount, samples: measurements });
    }
}

console.log(
    JSON.stringify(
        {
            node: process.version,
            platform: `${process.platform}-${process.arch}`,
            templateRoot,
            templates: files.length,
            rawBytes,
            mainReadMs: round(mainReadMs),
            mainReadCpuMs: round(mainReadCpuMs),
            mainDecodeMs: round(mainDecodeMs),
            mainDecodeCpuMs: round(mainDecodeCpuMs),
            v8PayloadBytes: encoded.byteLength,
            v8PayloadToRawRatio: round(encoded.byteLength / rawBytes),
            v8EncodeMs: round(encodeMs),
            v8EncodeCpuMs: round(encodeCpuMs),
            sharedArrayBufferBytes: sharedPayload.byteLength,
            sharedCopyMs: round(sharedCopyMs),
            sharedCopyCpuMs: round(sharedCopyCpuMs),
            blocksPerTemplate: Math.round(
                [...decoded.values()].reduce((total, template) => total + template.blocks.length, 0) / decoded.size
            ),
            templatesWithNbt: [...decoded.values()].filter(
                (template) =>
                    template.blocks.some((block) => block.nbt !== undefined) ||
                    template.entities.some((entity) => entity.nbt !== undefined)
            ).length,
            nbtPrototypePreservedBeforeTransport: nbtPrototypePreserved,
            nbtPrototypePreservedAfterStructuredClone: validation.structuredClonePreservedNbtPrototype,
            nbtPrototypePreservedAfterV8Transport: validation.v8PreservedNbtPrototype,
            transportValidationMs: round(validation.elapsedMs),
            transportValidationCpuMs: round(validation.cpuMs),
            digest: validation.digest,
            results: results.map(({ mode, workerCount, samples: entries }) => ({
                mode,
                workerCount,
                median: {
                    parallelWallMs: median(entries.map((entry) => entry.parallelWallMs)),
                    setupWallMs: median(entries.map((entry) => entry.setupWallMs)),
                    setupCpuMs: median(entries.map((entry) => entry.setupCpuMs)),
                    maxWorkerWorkMs: median(entries.map((entry) => entry.workerWorkMs)),
                    workerCpuMs: median(entries.map((entry) => entry.workerCpuMs)),
                    fileReadCpuMs: median(entries.map((entry) => entry.fileReadCpuMs)),
                    decodeCpuMs: median(entries.map((entry) => entry.decodeCpuMs)),
                    deserializeCpuMs: median(entries.map((entry) => entry.deserializeCpuMs))
                }
            }))
        },
        null,
        2
    )
);

function templateFiles(root: string): TemplateFile[] {
    const paths: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory)) {
            const path = join(directory, entry);
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith('.nbt')) paths.push(path);
        }
    };
    walk(root);

    return paths.sort().map((path) => ({
        id: `minecraft:${relative(root, path)
            .replaceAll('\\', '/')
            .replace(/\.nbt$/, '')}`,
        path
    }));
}

function runWorker(
    mode: WorkerMeasurement['mode'],
    templateFiles: readonly TemplateFile[],
    payload: SharedArrayBuffer,
    decodedTemplates: ReadonlyMap<string, JavaStructureTemplate>
): Promise<WorkerSample> {
    const worker = new Worker(new URL('./templateDecode.worker.ts', import.meta.url), {
        workerData:
            mode === 'decode'
                ? { mode, files: templateFiles }
                : mode === 'cloned-decoded'
                  ? { mode, templates: decodedTemplates }
                  : { mode, payload }
    });

    return new Promise((resolve, reject) => {
        worker.on('message', (reply: WorkerReply) => resolve(reply.measurement));
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Template decode worker exited with code ${code}.`));
        });
    });
}

function assertSummaryMatches(
    measurements: readonly WorkerSample[],
    mode: WorkerMeasurement['mode'],
    workerCount: number,
    sample: number
): void {
    const first = measurements[0];
    if (first === undefined) throw new Error(`${mode} started no workers.`);
    if (
        measurements.some(
            (entry) =>
                entry.templateCount !== first.templateCount ||
                entry.blockCount !== first.blockCount ||
                entry.paletteCount !== first.paletteCount ||
                entry.nbtTemplateCount !== first.nbtTemplateCount
        )
    ) {
        throw new Error(
            `${mode} workers reported different corpus summaries at ${workerCount} workers, sample ${sample}.`
        );
    }
}

function combineMeasurements(
    mode: WorkerMeasurement['mode'],
    measurements: readonly WorkerSample[],
    parallelWallMs: number,
    setupWallMs: number,
    setupCpuMs: number
): WorkerMeasurement {
    const first = measurements[0];
    if (first === undefined) throw new Error('The benchmark started no workers.');

    return {
        mode,
        fileReadCpuMs: sum(measurements.map((entry) => entry.fileReadCpuMs)),
        decodeCpuMs: sum(measurements.map((entry) => entry.decodeCpuMs)),
        deserializeCpuMs: sum(measurements.map((entry) => entry.deserializeCpuMs)),
        workerCpuMs: sum(measurements.map((entry) => entry.workerCpuMs)),
        workerWorkMs: Math.max(...measurements.map((entry) => entry.workerWorkMs)),
        parallelWallMs,
        setupWallMs,
        setupCpuMs,
        templateCount: first.templateCount,
        blockCount: first.blockCount,
        paletteCount: first.paletteCount,
        nbtTemplateCount: first.nbtTemplateCount,
        nbtPrototypePreserved: measurements.every((entry) => entry.nbtPrototypePreserved)
    };
}

function digestTemplates(templates: ReadonlyMap<string, JavaStructureTemplate>): string {
    const hash = createHash('sha256');
    for (const [id, template] of [...templates].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
        hash.update(id)
            .update('\0')
            .update(JSON.stringify(normalizeTemplateValue(template)));
    }
    return hash.digest('hex');
}

function validateTransports(
    templates: ReadonlyMap<string, JavaStructureTemplate>,
    payload: SharedArrayBuffer
): {
    digest: string;
    elapsedMs: number;
    cpuMs: number;
    structuredClonePreservedNbtPrototype: boolean;
    v8PreservedNbtPrototype: boolean;
} {
    const started = performance.now();
    const cpuStarted = process.threadCpuUsage();
    const digest = digestTemplates(templates);
    const cloned = structuredClone(templates);
    const v8Cloned = deserialize(Buffer.from(payload)) as Map<string, JavaStructureTemplate>;
    if (digestTemplates(cloned) !== digest || digestTemplates(v8Cloned) !== digest) {
        throw new Error(
            'A decoded transport changed template fields or the order of palettes, lists, or NBT children.'
        );
    }

    const nbtFromStructuredClone = firstNbtTemplate(cloned);
    const nbtFromV8 = firstNbtTemplate(v8Cloned);
    return {
        digest,
        elapsedMs: performance.now() - started,
        cpuMs: cpuMilliseconds(process.threadCpuUsage(cpuStarted)),
        structuredClonePreservedNbtPrototype:
            nbtFromStructuredClone === undefined || nbtFromStructuredClone instanceof NBTTagCompound,
        v8PreservedNbtPrototype: nbtFromV8 === undefined || nbtFromV8 instanceof NBTTagCompound
    };
}

function normalizeTemplateValue(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
        return typeof value === 'bigint' ? { bigint: value.toString() } : value;
    }
    if (Array.isArray(value)) return value.map(normalizeTemplateValue);
    if (value instanceof Map) {
        // NBT compound child order follows the file and is retained across serialization.
        return { map: [...value].map(([key, child]) => [normalizeTemplateValue(key), normalizeTemplateValue(child)]) };
    }
    if (value instanceof Set) {
        // NBT lists and template palettes carry meaningful file order.
        return { set: [...value].map(normalizeTemplateValue) };
    }

    // Structured cloning removes class prototypes. Sorting ordinary object keys lets this digest
    // compare the stored fields while preserving all ordered arrays, maps, and sets above.
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, child]) => [key, normalizeTemplateValue(child)])
    );
}

function firstNbtTemplate(templates: ReadonlyMap<string, JavaStructureTemplate>): unknown {
    for (const template of templates.values()) {
        const nbt = template.blocks.find((block) => block.nbt !== undefined)?.nbt;
        if (nbt !== undefined) return nbt;
        const entityNbt = template.entities.find((entity) => entity.nbt !== undefined)?.nbt;
        if (entityNbt !== undefined) return entityNbt;
    }
    return undefined;
}

function parseCounts(value: string): number[] {
    const counts = value.split(',').map((entry) => parsePositiveInteger(entry));
    if (counts.length === 0) throw new Error('JSP_TEMPLATE_WORKER_COUNTS must list at least one worker count.');
    return counts;
}

function parsePositiveInteger(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Expected a positive integer, got ${value}.`);
    return parsed;
}

function cpuMilliseconds(usage: ReturnType<typeof process.threadCpuUsage>): number {
    return (usage.user + usage.system) / 1000;
}

function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle];
    return round(value ?? 0);
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
