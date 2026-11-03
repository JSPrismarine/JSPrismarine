import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

type ContentBuilder = typeof import('../src/content/ServerContent.js').buildServerContent;
type BlockResolver = typeof import('@jsprismarine/blocks').resolveBlocks;
type PackStackResolver = typeof import('../src/content/packStack.js').resolvePackStack;
type PackLoader = typeof import('@jsprismarine/packs').load;
type JavaBlockTagMapper = typeof import('../src/content/javaTags.js').javaBlockTagsForBedrock;
type BlockDefinitions = ReturnType<PackLoader>['definitions']['blocks'];

const round = (value: number): number => Number(value.toFixed(3));

const median = (values: number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

const readCountOption = (name: string, fallback: number): number => {
    const index = process.argv.indexOf(name);
    if (index < 0) return fallback;

    const value = Number(process.argv[index + 1]);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
    return value;
};

const readProjectRoot = (): string => {
    const index = process.argv.indexOf('--project-root');
    if (index >= 0) {
        const value = process.argv[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error('--project-root requires a path');
        return resolve(value);
    }

    return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
};

const assertCompleteBlocks = (stateCount: number, paletteStateCount: number, typeCount: number): void => {
    if (typeCount === 0 || stateCount !== paletteStateCount) {
        throw new Error(
            `block resolution was incomplete: ${typeCount} types, ${stateCount}/${paletteStateCount} palette states`
        );
    }
};

const statsOf = (content: ReturnType<ContentBuilder>) => {
    const errors = content.diagnostics.filter(({ severity }) => severity === 'error').length;
    if (errors > 0) throw new Error(`buildServerContent reported ${errors} errors`);

    const blockTypeCount = content.blocks.types.size;
    const blockStateCount = content.blocks.states.length;
    assertCompleteBlocks(blockStateCount, content.blocks.palette.stateCount, blockTypeCount);

    return { blockTypeCount, blockStateCount };
};

const cpuTimeOf = (before: ReturnType<typeof process.cpuUsage>): number => {
    const usage = process.cpuUsage(before);
    return usage.user + usage.system;
};

const measureResolver = (
    resolveBlocks: BlockResolver,
    definitions: BlockDefinitions,
    options: NonNullable<Parameters<BlockResolver>[1]>,
    paletteStateCount: number
) => {
    const beforeCpu = process.cpuUsage();
    const start = performance.now();
    const resolved = resolveBlocks(definitions.values(), options);
    const wallMs = performance.now() - start;
    const cpuUs = cpuTimeOf(beforeCpu);

    assertCompleteBlocks(resolved.states.length, paletteStateCount, resolved.types.size);
    if (resolved.diagnostics.some(({ severity }) => severity === 'error')) {
        throw new Error('resolveBlocks reported an error while resolving the default block stack');
    }

    return {
        blockTypeCount: resolved.types.size,
        blockStateCount: resolved.states.length,
        cpuMs: cpuUs / 1000,
        wallMs
    };
};

const measureRetainedHeap = (buildServerContent: ContentBuilder) => {
    if (typeof global.gc !== 'function') throw new Error('run this benchmark with --expose-gc');

    global.gc();
    global.gc();
    const beforeBytes = process.memoryUsage().heapUsed;
    const content = buildServerContent();
    global.gc();
    global.gc();
    const afterBytes = process.memoryUsage().heapUsed;
    const stats = statsOf(content);

    return { ...stats, beforeBytes, afterBytes, retainedBytes: afterBytes - beforeBytes };
};

const main = async (): Promise<void> => {
    if (process.argv.includes('--help')) {
        process.stdout.write(
            'Usage: pnpm --filter @jsprismarine/prismarine run bench:block-state-allocation -- [--project-root PATH] [--warmups N] [--samples N] [--heap-samples N]\n'
        );
        return;
    }

    const projectRoot = readProjectRoot();
    const paths = {
        content: resolve(projectRoot, 'packages/prismarine/src/content/ServerContent.ts'),
        packStack: resolve(projectRoot, 'packages/prismarine/src/content/packStack.ts'),
        javaTags: resolve(projectRoot, 'packages/prismarine/src/content/javaTags.ts'),
        blocks: resolve(projectRoot, 'packages/blocks/src/index.ts'),
        packs: resolve(projectRoot, 'packages/packs/src/index.ts')
    };
    for (const path of Object.values(paths)) {
        if (!existsSync(path)) throw new Error(`benchmark source is missing: ${path}`);
    }

    const [contentModule, packStackModule, javaTagsModule, blocksModule, packsModule] = await Promise.all([
        import(pathToFileURL(paths.content).href),
        import(pathToFileURL(paths.packStack).href),
        import(pathToFileURL(paths.javaTags).href),
        import(pathToFileURL(paths.blocks).href),
        import(pathToFileURL(paths.packs).href)
    ]);
    // These imports come from a revision selected at runtime. The annotations retain the current
    // source declarations while allowing the same runner to load its parent revision.
    const buildServerContent: ContentBuilder = contentModule.buildServerContent;
    const resolvePackStack: PackStackResolver = packStackModule.resolvePackStack;
    const javaBlockTagsForBedrock: JavaBlockTagMapper = javaTagsModule.javaBlockTagsForBedrock;
    const resolveBlocks: BlockResolver = blocksModule.resolveBlocks;
    const loadPacks: PackLoader = packsModule.load;

    const warmups = readCountOption('--warmups', 1);
    const samples = readCountOption('--samples', 7);
    const heapSamples = readCountOption('--heap-samples', 1);
    if (typeof global.gc !== 'function') throw new Error('run this benchmark with --expose-gc');

    const heapRuns = [];
    for (let index = 0; index < heapSamples; index += 1) heapRuns.push(measureRetainedHeap(buildServerContent));

    const resolvedStack = resolvePackStack();
    if (resolvedStack.diagnostics.length > 0) {
        throw new Error('the default pack stack is incomplete; fetch the pinned vanilla sources before benchmarking');
    }
    const loaded =
        resolvedStack.cache === undefined
            ? loadPacks(resolvedStack.stack, { strict: false })
            : loadPacks(resolvedStack.stack, { strict: false, cache: resolvedStack.cache });
    const definitions = loaded.definitions.blocks;
    if (definitions.size === 0) throw new Error('the default pack stack contains no block definitions');
    const content = buildServerContent();
    statsOf(content);
    const options: NonNullable<Parameters<BlockResolver>[1]> = {
        behaviors: content.blocks.behaviors,
        statePalette: content.blocks.palette,
        javaTags: (identifier, values) => javaBlockTagsForBedrock(content.tags, identifier, values),
        strict: false
    };

    for (let index = 0; index < warmups; index += 1) {
        measureResolver(resolveBlocks, definitions, options, content.blocks.palette.stateCount);
    }

    const cpuRuns = [];
    for (let index = 0; index < samples; index += 1) {
        if (typeof global.gc === 'function') {
            global.gc();
            global.gc();
        }
        cpuRuns.push(measureResolver(resolveBlocks, definitions, options, content.blocks.palette.stateCount));
    }

    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
    const output = {
        revision,
        projectRoot,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        missingPackWarnings: resolvedStack.diagnostics.map(({ pack, code }) => ({ pack, code })),
        inputBlockDefinitions: definitions.size,
        warmups,
        cpuSamples: cpuRuns.map(({ cpuMs, wallMs, blockStateCount, blockTypeCount }) => ({
            resolveBlocksCpuMs: round(cpuMs),
            resolveBlocksWallMs: round(wallMs),
            blockStateCount,
            blockTypeCount
        })),
        medianResolveBlocksCpuMs: round(median(cpuRuns.map(({ cpuMs }) => cpuMs))),
        heapSamples: heapRuns.map(({ retainedBytes, blockStateCount, blockTypeCount }) => ({
            retainedBytes,
            retainedMiB: round(retainedBytes / 1024 ** 2),
            blockStateCount,
            blockTypeCount
        })),
        medianRetainedHeapBytes: median(heapRuns.map(({ retainedBytes }) => retainedBytes)),
        medianRetainedHeapMiB: round(median(heapRuns.map(({ retainedBytes }) => retainedBytes)) / 1024 ** 2)
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

await main();
