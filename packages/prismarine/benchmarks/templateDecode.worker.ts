import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

import type { JavaStructureTemplate } from '@jsprismarine/structures';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { readJavaStructureTemplate } from '@jsprismarine/structures';

interface TemplateFile {
    readonly id: string;
    readonly path: string;
}

interface DecodeWorkerData {
    readonly mode: 'decode';
    readonly files: readonly TemplateFile[];
}

interface ClonedDecodedWorkerData {
    readonly mode: 'cloned-decoded';
    readonly templates: ReadonlyMap<string, JavaStructureTemplate>;
}

interface SharedDecodedWorkerData {
    readonly mode: 'shared-decoded';
    readonly payload: SharedArrayBuffer;
}

interface WorkerMeasurement {
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

const workerStarted = performance.now();
const totalCpuStarted = process.threadCpuUsage();
let fileReadCpuMs = 0;
let decodeCpuMs = 0;
let deserializeCpuMs = 0;
let templates: ReadonlyMap<string, JavaStructureTemplate>;
let mode: WorkerMeasurement['mode'];

if (isDecodeWorkerData(workerData)) {
    mode = workerData.mode;
    const beforeRead = process.threadCpuUsage();
    const files = workerData.files.map(({ id, path }) => ({ id, bytes: readFileSync(path) }));
    fileReadCpuMs = cpuMilliseconds(process.threadCpuUsage(beforeRead));

    const beforeDecode = process.threadCpuUsage();
    templates = new Map(files.map(({ id, bytes }) => [id, readJavaStructureTemplate(bytes)]));
    decodeCpuMs = cpuMilliseconds(process.threadCpuUsage(beforeDecode));
} else if (isClonedDecodedWorkerData(workerData)) {
    mode = workerData.mode;
    // Worker `workerData` is structured-cloned on the spawning thread. It copies the decoded
    // graph but strips NBTTagCompound and scalar-tag prototypes, so this is only a timing probe.
    templates = workerData.templates;
} else if (isSharedDecodedWorkerData(workerData)) {
    mode = workerData.mode;
    const beforeDeserialize = process.threadCpuUsage();
    // One shared V8 payload avoids cloning megabytes for each worker, but `deserialize` restores
    // plain object graphs; it does not restore NBTTagCompound or scalar-tag prototypes.
    // This is the V8 payload serialized from the typed template map in the parent process.
    templates = deserialize(Buffer.from(workerData.payload)) as ReadonlyMap<string, JavaStructureTemplate>;
    deserializeCpuMs = cpuMilliseconds(process.threadCpuUsage(beforeDeserialize));
} else {
    throw new TypeError('The template decode worker received unsupported input.');
}

const firstNbt = firstNbtTemplate(templates);
const nbtTemplateCount = [...templates.values()].filter(
    (template) =>
        template.blocks.some((block) => block.nbt !== undefined) ||
        template.entities.some((entity) => entity.nbt !== undefined)
).length;
const templateCount = templates.size;
const blockCount = [...templates.values()].reduce((total, template) => total + template.blocks.length, 0);
const paletteCount = [...templates.values()].reduce((total, template) => total + template.palette.length, 0);
const workerCpuMs = cpuMilliseconds(process.threadCpuUsage(totalCpuStarted));
const workerWorkMs = performance.now() - workerStarted;

parentPort?.postMessage({
    measurement: {
        mode,
        fileReadCpuMs,
        decodeCpuMs,
        deserializeCpuMs,
        workerCpuMs,
        workerWorkMs,
        templateCount,
        blockCount,
        paletteCount,
        nbtTemplateCount,
        nbtPrototypePreserved: firstNbt === undefined || firstNbt instanceof NBTTagCompound
    } satisfies WorkerMeasurement
});

function isDecodeWorkerData(value: unknown): value is DecodeWorkerData {
    return (
        typeof value === 'object' &&
        value !== null &&
        'mode' in value &&
        value.mode === 'decode' &&
        'files' in value &&
        Array.isArray(value.files)
    );
}

function isSharedDecodedWorkerData(value: unknown): value is SharedDecodedWorkerData {
    return (
        typeof value === 'object' &&
        value !== null &&
        'mode' in value &&
        value.mode === 'shared-decoded' &&
        'payload' in value &&
        value.payload instanceof SharedArrayBuffer
    );
}

function isClonedDecodedWorkerData(value: unknown): value is ClonedDecodedWorkerData {
    return (
        typeof value === 'object' &&
        value !== null &&
        'mode' in value &&
        value.mode === 'cloned-decoded' &&
        'templates' in value &&
        value.templates instanceof Map
    );
}

function firstNbtTemplate(source: ReadonlyMap<string, JavaStructureTemplate>): unknown {
    for (const template of source.values()) {
        const nbt = template.blocks.find((block) => block.nbt !== undefined)?.nbt;
        if (nbt !== undefined) return nbt;
        const entityNbt = template.entities.find((entity) => entity.nbt !== undefined)?.nbt;
        if (entityNbt !== undefined) return entityNbt;
    }
    return undefined;
}

function cpuMilliseconds(usage: ReturnType<typeof process.threadCpuUsage>): number {
    return (usage.user + usage.system) / 1000;
}
