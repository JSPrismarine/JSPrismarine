/**
 * Reads every real structure template Mojang ships, in both formats, and
 * measures what the Java to Bedrock translation costs.
 *
 * The test needs the pinned sources on disk, so it is gated behind
 * `JSP_STRUCTURE_CORPUS=1` and skipped otherwise:
 *
 *     pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 *     JSP_STRUCTURE_CORPUS=1 pnpm --filter @jsprismarine/structures exec vitest run corpus
 *
 * `JSP_BDS_PATH` and `JSP_JAVA_JAR_PATH` point at local copies, the same two
 * variables `packages/bedrock-data/sources.json` documents.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZip } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { readJavaStructureTemplate } from './javaTemplate';
import { readMcStructure } from './bedrockTemplate';
import { translateJavaTemplate } from './translate';

const enabled = process.env.JSP_STRUCTURE_CORPUS === '1';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
// The pinned versions are this repository's own manifest, parsed JSON.
const sources = JSON.parse(readFileSync(join(repoRoot, 'packages/bedrock-data/sources.json'), 'utf8')) as {
    bds: { version: string };
    javaServer: { version: string };
};
const cache = join(repoRoot, 'node_modules/.cache/jsprismarine');

const walk = (directory: string, found: string[] = []): string[] => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path, found);
        else found.push(path);
    }
    return found;
};

const bdsRoot = (): string | undefined => {
    const candidates = [
        process.env.JSP_BDS_PATH,
        join(cache, 'bds', sources.bds.version, 'unpacked'),
        join(cache, 'bds', sources.bds.version)
    ].filter((candidate): candidate is string => candidate !== undefined);
    return candidates.find((candidate) => existsSync(join(candidate, 'behavior_packs')));
};

const javaJar = (): string | undefined =>
    [
        process.env.JSP_JAVA_JAR_PATH,
        join(cache, 'java-server', sources.javaServer.version, 'server.jar'),
        join(cache, 'java', sources.javaServer.version, 'server.jar')
    ]
        .filter((candidate): candidate is string => candidate !== undefined)
        .find((candidate) => existsSync(candidate));

/** The `.nbt` templates inside the Java server jar, which is a bundler jar holding the real one. */
const javaTemplates = (jarPath: string): Map<string, Uint8Array> => {
    const outer = readZip(readFileSync(jarPath));
    const innerName = `META-INF/versions/${sources.javaServer.version}/server-${sources.javaServer.version}.jar`;
    const inner = outer.get(innerName);
    if (inner === undefined) throw new Error(`${jarPath} has no ${innerName}`);

    const templates = new Map<string, Uint8Array>();
    for (const [name, bytes] of readZip(inner)) {
        if (name.startsWith('data/minecraft/structure/') && name.endsWith('.nbt')) templates.set(name, bytes);
    }
    return templates;
};

interface Measurement {
    files: number;
    paletteEntries: number;
    blocks: number;
    mappedBlocks: number;
    lostBlocks: number;
    lostEntries: number;
    lostNames: Set<string>;
    errors: string[];
}

const measure = (templates: Iterable<[string, Uint8Array]>): Measurement => {
    const result: Measurement = {
        files: 0,
        paletteEntries: 0,
        blocks: 0,
        mappedBlocks: 0,
        lostBlocks: 0,
        lostEntries: 0,
        lostNames: new Set(),
        errors: []
    };

    for (const [name, bytes] of templates) {
        result.files++;
        try {
            const template = readJavaStructureTemplate(bytes);
            const translated = translateJavaTemplate(template);
            result.paletteEntries += template.palette.length;
            result.blocks += template.blocks.length;
            result.mappedBlocks += translated.mappedBlocks;
            result.lostBlocks += translated.lostBlocks;
            result.lostEntries += translated.losses.length;
            for (const loss of translated.losses) result.lostNames.add(loss.javaState.name);
        } catch (error) {
            result.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return result;
};

const report = (label: string, measurement: Measurement): void => {
    const share = ((measurement.mappedBlocks / Math.max(1, measurement.blocks)) * 100).toFixed(2);
    // The measurement is the point of this test, so it goes to stdout
    // rather than through a logger the package does not own.
    process.stdout.write(
        `${label}: ${measurement.files} files, ${measurement.paletteEntries} palette entries, ` +
            `${measurement.blocks} blocks, ${measurement.mappedBlocks} mapped (${share}%), ` +
            `${measurement.lostBlocks} lost over ${measurement.lostEntries} palette entries ` +
            `and ${measurement.lostNames.size} distinct identifiers\n`
    );
};

describe.skipIf(!enabled)('the shipped structure template corpus', () => {
    it('reads every Java Edition 26.3 template in the server jar with no error', { timeout: 300000 }, () => {
        const jarPath = javaJar();
        expect(jarPath, 'the pinned Java server jar is not in the cache').toBeDefined();

        const measurement = measure(javaTemplates(jarPath as string));
        report('java 26.3', measurement);

        expect(measurement.errors).toEqual([]);
        expect(measurement.files).toBe(1511);
        // Java 26.3 is the sourcing choice for structures, and every one of
        // its block states reaches a Bedrock palette state.
        expect(measurement.lostBlocks).toBe(0);
        expect(measurement.lostEntries).toBe(0);
        expect(measurement.mappedBlocks).toBe(measurement.blocks);
    });

    it('reads every template in the Bedrock Dedicated Server zip with no error', { timeout: 300000 }, () => {
        const root = bdsRoot();
        expect(root, 'the pinned Bedrock Dedicated Server zip is not in the cache').toBeDefined();

        const paths = walk(join(root as string, 'behavior_packs')).filter(
            (path) => path.endsWith('.nbt') && statSync(path).size > 0
        );
        const measurement = measure(paths.map((path) => [path, readFileSync(path)] as [string, Uint8Array]));
        report('bedrock 1.26.51.1', measurement);

        expect(measurement.errors).toEqual([]);
        expect(measurement.files).toBe(1311);
        // The Bedrock zip's templates were last saved before Java's 1.13
        // flattening, so their palettes name blocks the pinned Java version
        // no longer has. Those are reported, never dropped quietly.
        expect(measurement.lostNames.size).toBe(47);
        expect(measurement.mappedBlocks / measurement.blocks).toBeGreaterThan(0.97);
    });

    it('reads every .mcstructure in the Bedrock Dedicated Server zip with no error', () => {
        const root = bdsRoot();
        expect(root, 'the pinned Bedrock Dedicated Server zip is not in the cache').toBeDefined();

        const paths = walk(join(root as string, 'behavior_packs')).filter((path) => path.endsWith('.mcstructure'));
        const errors: string[] = [];
        let blocks = 0;
        for (const path of paths) {
            try {
                blocks += readMcStructure(readFileSync(path)).blocks.length;
            } catch (error) {
                errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        process.stdout.write(`mcstructure: ${paths.length} files, ${blocks} blocks\n`);

        expect(errors).toEqual([]);
        expect(paths).toHaveLength(15);
    });
});
