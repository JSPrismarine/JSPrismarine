import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.join(root, 'packages');
const packageRows = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
        const directory = path.join(packageRoot, entry.name);
        const manifestPath = path.join(directory, 'package.json');
        if (!existsSync(manifestPath)) return [];

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.name === undefined || manifest.exports === undefined) return [];

        return [{ directory, manifest }];
    });

const checks = packageRows.flatMap(({ directory, manifest }) => {
    const exports = manifest.exports;
    const candidates = [];
    for (const [key, targets] of Object.entries(exports)) {
        if (key === './package.json' || typeof targets !== 'object' || targets === null) continue;

        const sourceTarget = targets.default;
        const distTarget = targets['jsprismarine:dist'];
        if (typeof sourceTarget !== 'string' || typeof distTarget !== 'string') continue;

        const selector = key === './*' ? './index' : key;
        const specifier = key === '.' ? manifest.name : `${manifest.name}/${selector.slice(2)}`;
        const wildcard = selector.slice(2);
        // Node substitutes the captured export subpath at every `*` in the target pattern.
        candidates.push({
            specifier,
            directory,
            source: path.resolve(directory, sourceTarget.replaceAll('*', wildcard)),
            dist: path.resolve(directory, distTarget.replaceAll('*', wildcard))
        });
    }
    return candidates;
});

const resolveProgram = `
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const checks = JSON.parse(process.env.JSP_EXPORT_SPECIFIERS);
process.stdout.write(JSON.stringify(checks.map(({ specifier, directory }) =>
    createRequire(pathToFileURL(directory + '/package.json')).resolve(specifier)
)));
`;

const resolveSpecifiers = (conditions) => {
    const result = spawnSync(
        process.execPath,
        [
            ...conditions.flatMap((condition) => ['--conditions', condition]),
            '--input-type=module',
            '-e',
            resolveProgram
        ],
        {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, JSP_EXPORT_SPECIFIERS: JSON.stringify(checks) }
        }
    );
    if (result.status !== 0) throw new Error(result.stderr || `Node resolver exited with ${result.status}`);
    return JSON.parse(result.stdout);
};

const sourceUrls = resolveSpecifiers([]);
const distUrls = resolveSpecifiers(['jsprismarine:dist']);
for (const [index, check] of checks.entries()) {
    assert.equal(realpathSync(sourceUrls[index]), realpathSync(check.source), `${check.specifier} source export`);
    assert.equal(realpathSync(distUrls[index]), realpathSync(check.dist), `${check.specifier} dist export`);
}

const runtimeCheck = spawnSync(
    process.execPath,
    [
        '--conditions=jsprismarine:dist',
        '--input-type=module',
        '-e',
        `
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { defaultGenerationWorker, workerExecArgv } from '@jsprismarine/chunkgen/GenerationPool';
import { defaultChunkPipeline } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
const pipeline = defaultChunkPipeline();
const worker = defaultGenerationWorker();
assert.equal(basename(pipeline), 'chunkPipeline.es.js');
assert.equal(basename(worker), 'generationWorker.es.js');
assert.equal(workerExecArgv({ pipeline, workers: 1 }, { execArgv: process.execArgv, nodeOptions: '' }), undefined);
process.stdout.write(JSON.stringify({ pipeline, worker, workerExecArgv: undefined }));
`
    ],
    { cwd: path.join(packageRoot, 'prismarine'), encoding: 'utf8' }
);
if (runtimeCheck.status !== 0)
    throw new Error(runtimeCheck.stderr || `Worker check exited with ${runtimeCheck.status}`);

console.log(`Resolved ${checks.length} workspace exports from source and dist.`);
console.log(runtimeCheck.stdout);
