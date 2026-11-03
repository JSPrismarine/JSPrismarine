/**
 * Benchmarks recipe lookup over Java's complete 26.3 recipe registry and repeated villager crafting.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:recipes`.
 * The pinned Java server jar must be present in the fetch cache or `JSP_JAVA_JAR_PATH`.
 */
import os from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadRecipes } from '@jsprismarine/recipes';
import type { CraftingGrid, RecipeInput, RecipeMatch } from '@jsprismarine/recipes';
import { readZip } from '@jsprismarine/packs';
import { fixtureContentOptions } from '../src/content/testing';
import { buildServerContent } from '../src/content/ServerContent';
import type { ServerContent } from '../src/content/ServerContent';
import { EntityRuntime } from '../src/entity/data/EntityRuntime';
import { TestEntityWorld } from '../src/entity/data/testing';

const OPERATIONS = 2_000;
const CRAFT_OPERATIONS = 500;
const SAMPLES = 7;
const WARMUPS = 2;

const repositoryRoot = (): string => {
    for (const candidate of [process.cwd(), resolve(process.cwd(), '../..')])
        if (existsSync(resolve(candidate, 'packages/bedrock-data/sources.json'))) return candidate;
    throw new Error('run this benchmark from the repository root or a package directory');
};

const root = repositoryRoot();
const readJavaVersion = (): string => {
    const manifest: unknown = JSON.parse(readFileSync(resolve(root, 'packages/bedrock-data/sources.json'), 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || !('javaServer' in manifest))
        throw new Error('the source manifest does not declare a Java server');
    const javaServer = manifest.javaServer;
    if (typeof javaServer !== 'object' || javaServer === null || !('version' in javaServer))
        throw new Error('the source manifest does not declare the Java server version');
    if (typeof javaServer.version !== 'string') throw new Error('the Java server version is not a string');
    return javaServer.version;
};

const jarPath = resolve(
    process.env['JSP_JAVA_JAR_PATH'] ??
        resolve(root, 'node_modules/.cache/jsprismarine/java-server', readJavaVersion(), 'server.jar')
);
const outerJar = readZip(readFileSync(jarPath));
const innerJarName = [...outerJar.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
if (innerJarName === undefined) throw new Error('the Java server jar does not contain its inner server jar');
const innerJar = readZip(outerJar.get(innerJarName)!);
const recipePrefix = 'data/minecraft/recipe/';
const files = [...innerJar].filter(([name]) => name.startsWith(recipePrefix) && name.endsWith('.json'));

/** Parses an untrusted recipe file as unknown so the recipe loader validates its shape. */
const recipeJson = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));

const { book } = loadRecipes(
    files.map(
        ([name, bytes]) => [`minecraft:${name.slice(recipePrefix.length, -'.json'.length)}`, recipeJson(bytes)] as const
    )
);

const item = (id: string) => ({ id, count: 1 });
const input = (width: number, slots: CraftingGrid['slots']): RecipeInput => ({
    station: 'crafting',
    grid: { width, height: slots.length / width, slots }
});

const scenarios = [
    {
        name: 'empty',
        input: input(
            3,
            Array.from({ length: 9 }, () => null)
        )
    },
    { name: 'single-plank', input: input(1, [item('minecraft:oak_planks')]) },
    { name: 'oak-pressure-plate', input: input(2, [item('minecraft:oak_planks'), item('minecraft:oak_planks')]) },
    {
        name: 'bread',
        input: input(
            3,
            Array.from({ length: 3 }, () => item('minecraft:wheat'))
        )
    },
    {
        name: 'no-match',
        input: input(
            3,
            Array.from({ length: 9 }, () => item('minecraft:barrier'))
        )
    }
] as const;

const stationReads = book.byStation('crafting').map((recipe) => ({ recipe, station: recipe.station }));

const countCandidates = (input: RecipeInput, all: boolean): number => {
    let reads = 0;
    for (const { recipe, station } of stationReads) {
        Object.defineProperty(recipe, 'station', {
            configurable: true,
            get: () => {
                reads++;
                return station;
            }
        });
    }
    try {
        if (all) book.matchAll(input);
        else book.match(input);
    } finally {
        for (const { recipe, station } of stationReads)
            Object.defineProperty(recipe, 'station', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: station
            });
    }
    return reads;
};

const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;

const measure = <T>(operation: () => T, operations: number) => {
    const runs = Array.from({ length: SAMPLES }, () => {
        let checksum = 0;
        const started = performance.now();
        for (let index = 0; index < operations; index++) {
            const result = operation();
            if (Array.isArray(result)) checksum += result.length;
            else if (
                typeof result === 'object' &&
                result !== null &&
                'recipe' in result &&
                typeof result.recipe === 'object' &&
                result.recipe !== null &&
                'id' in result.recipe &&
                typeof result.recipe.id === 'string'
            )
                checksum += result.recipe.id.length;
            else if (
                typeof result === 'object' &&
                result !== null &&
                'recipeId' in result &&
                typeof result.recipeId === 'string'
            )
                checksum += result.recipeId.length;
        }
        return { ms: performance.now() - started, checksum };
    });
    const times = runs.map(({ ms }) => ms).sort((left, right) => left - right);
    const checksums = new Set(runs.map(({ checksum }) => checksum));
    if (checksums.size !== 1) throw new Error('Recipe benchmark output changed between samples');
    return { p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95), checksum: runs[0]?.checksum ?? 0 };
};

for (const scenario of scenarios) {
    const match = (): RecipeMatch | undefined => book.match(scenario.input);
    const matchAll = (): readonly RecipeMatch[] => book.matchAll(scenario.input);
    for (let warmup = 0; warmup < WARMUPS; warmup++) {
        for (let index = 0; index < 100; index++) {
            match();
            matchAll();
        }
    }
    const matchCandidates = countCandidates(scenario.input, false);
    const matchAllCandidates = countCandidates(scenario.input, true);
    process.stdout.write(
        `${JSON.stringify({
            benchmark: 'recipe-match',
            scenario: scenario.name,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            recipes: book.byStation('crafting').length,
            operations: OPERATIONS,
            matchCandidates,
            matchAllCandidates,
            match: measure(match, OPERATIONS),
            matchAll: measure(matchAll, OPERATIONS)
        })}\n`
    );
}

const baseContent = buildServerContent(fixtureContentOptions());
const content: ServerContent = { ...baseContent, recipes: book };
const world = new TestEntityWorld();
const runtime = new EntityRuntime({ content: () => content, world: world.world, host: world.host });
const craft = () => runtime.craftInto('minecraft:wheat', 'minecraft:bread', 64, 32);
const coldStarted = performance.now();
const coldResult = craft();
const coldMs = performance.now() - coldStarted;
const candidateReadsByInputCount = Array.from({ length: 3 }, (_, index) => {
    const count = index + 1;
    const slots = Array.from({ length: 9 }, (_unused, slot) => (slot < count ? item('minecraft:wheat') : null));
    return countCandidates({ station: 'crafting', grid: { width: 3, height: 3, slots } }, true);
});
for (let warmup = 0; warmup < WARMUPS; warmup++) for (let index = 0; index < 100; index++) craft();

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'recipe-craft-into',
        input: 'minecraft:wheat',
        output: 'minecraft:bread',
        recipes: book.byStation('crafting').length,
        operations: CRAFT_OPERATIONS,
        coldMs,
        coldResult,
        candidateReadsByInputCount,
        candidateReadsPerColdCall: candidateReadsByInputCount.reduce((total, count) => total + count, 0),
        result: measure(craft, CRAFT_OPERATIONS)
    })}\n`
);
