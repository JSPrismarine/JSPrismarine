import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = [
    {
        packageDirectory: 'packages/blocks',
        asset: 'tables/blockGeometry.json',
        wrapper: 'tables/blockGeometry.js',
        runtime: 'geometry.js'
    },
    {
        packageDirectory: 'packages/items',
        asset: 'tables/itemTypes.json',
        wrapper: 'tables/itemTypes.js',
        runtime: 'tables.js'
    }
];

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];

const child = process.argv[2] === '--child';
if (child) {
    const [kind, modulePath] = process.argv.slice(3);
    globalThis.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const module =
        kind === 'json'
            ? await import(pathToFileURL(modulePath).href, { with: { type: 'json' } })
            : await import(pathToFileURL(modulePath).href);
    const importMs = performance.now() - start;
    globalThis.gc();
    const heapBytes = process.memoryUsage().heapUsed - heapBefore;
    process.stdout.write(JSON.stringify({ digest: digest(module.default), importMs, heapBytes }));
} else {
    const mode = process.argv[2] ?? 'check';
    if (!['check', 'bench'].includes(mode)) throw new Error('Usage: node scripts/json-assets.mjs [check|bench]');
    if (mode === 'bench' && !process.execArgv.includes('--expose-gc')) {
        throw new Error('Run the benchmark with `node --expose-gc scripts/json-assets.mjs bench`.');
    }

    const rounds = Number(process.argv[3] ?? 5);
    if (!Number.isInteger(rounds) || rounds < 1) throw new Error('Benchmark rounds must be a positive integer.');
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-json-assets-'));
    try {
        for (const [index, testCase] of cases.entries()) {
            const packageRoot = path.join(root, testCase.packageDirectory);
            const packDirectory = path.join(temporaryRoot, `pack-${index}`);
            const consumerDirectory = path.join(temporaryRoot, `consumer-${index}`);
            mkdirSync(packDirectory, { recursive: true });
            mkdirSync(consumerDirectory, { recursive: true });

            execFileSync('pnpm', ['pack', '--pack-destination', packDirectory], {
                cwd: packageRoot,
                stdio: 'ignore'
            });
            const archive = readdirSync(packDirectory).find((file) => file.endsWith('.tgz'));
            if (archive === undefined)
                throw new Error(`pnpm pack produced no tarball for ${testCase.packageDirectory}`);
            execFileSync('tar', [
                '-xzf',
                path.join(packDirectory, archive),
                '-C',
                consumerDirectory,
                '--strip-components=1'
            ]);

            const distDirectory = path.join(consumerDirectory, 'dist');
            const assetPath = path.join(distDirectory, testCase.asset);
            const wrapperPath = path.join(distDirectory, testCase.wrapper);
            const declarationPath = `${assetPath}.d.ts`;
            assert(existsSync(assetPath), `${testCase.packageDirectory} packed JSON asset`);
            assert(existsSync(declarationPath), `${testCase.packageDirectory} packed JSON declaration`);

            const parsed = await import(pathToFileURL(assetPath).href, { with: { type: 'json' } });
            const wrapper = await import(pathToFileURL(wrapperPath).href);
            assert.deepEqual(
                wrapper.default,
                parsed.default,
                `${testCase.packageDirectory} JSON wrapper matches its asset`
            );

            if (testCase.runtime === 'geometry.js') {
                const runtime = await import(pathToFileURL(path.join(distDirectory, testCase.runtime)).href);
                for (const [identifier, row] of Object.entries(parsed.default.blocks)) {
                    assert.equal(
                        runtime.bedrockCollisionTopOf(identifier),
                        row.top,
                        `packed geometry lookup for ${identifier}`
                    );
                }
            } else if (testCase.runtime === 'tables.js') {
                const runtime = await import(pathToFileURL(path.join(distDirectory, testCase.runtime)).href);
                assert.deepEqual(runtime.itemTypesTable, parsed.default, 'packed item table matches its JSON asset');
            }

            if (mode === 'check') {
                process.stdout.write(
                    `${testCase.packageDirectory}: packed JSON asset, declaration, and runtime match\n`
                );
                continue;
            }

            const literalPath = path.join(consumerDirectory, 'json-literal-benchmark.mjs');
            writeFileSync(literalPath, `export default ${JSON.stringify(parsed.default)};\n`);
            const samples = { literal: [], json: [] };
            for (let round = 0; round < rounds; round += 1) {
                const order = round % 2 === 0 ? ['literal', 'json'] : ['json', 'literal'];
                for (const kind of order) {
                    const report = JSON.parse(
                        execFileSync(
                            process.execPath,
                            [
                                '--expose-gc',
                                import.meta.filename,
                                '--child',
                                kind,
                                kind === 'json' ? assetPath : literalPath
                            ],
                            {
                                encoding: 'utf8'
                            }
                        )
                    );
                    samples[kind].push(report);
                }
            }

            const literalDigest = samples.literal[0].digest;
            assert(
                samples.literal.every((sample) => sample.digest === literalDigest),
                'literal benchmark workload digest is stable'
            );
            assert(
                samples.json.every((sample) => sample.digest === literalDigest),
                'JSON module preserves the literal table values'
            );
            process.stdout.write(
                `${JSON.stringify(
                    {
                        package: testCase.packageDirectory,
                        asset: testCase.asset,
                        sourceBytes: statSync(assetPath).size,
                        workloadDigest: literalDigest,
                        rounds,
                        literal: {
                            medianImportMs: median(samples.literal.map((sample) => sample.importMs)),
                            medianRetainedHeapBytes: median(samples.literal.map((sample) => sample.heapBytes))
                        },
                        json: {
                            medianImportMs: median(samples.json.map((sample) => sample.importMs)),
                            medianRetainedHeapBytes: median(samples.json.map((sample) => sample.heapBytes))
                        }
                    },
                    null,
                    4
                )}\n`
            );
        }
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
}
