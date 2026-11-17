/**
 * Generates the Script API's shape from the pinned `bedrock-samples` checkout's
 * `metadata/script_modules`, into `src/generated/`
 * ([ADR 0022](../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * Fetches the pinned checkout into the shared cache when it is missing, or reads the one
 * `JSP_BEDROCK_SAMPLES_PATH` names. With `--check` it writes nothing, and fails when a checked-in
 * file differs from what the metadata generates, or when a generated file is missing or extra.
 *
 *     node scripts/generate-shape.mts [--check]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { GENERATED_DIR, emitShape } from './shape/emit.mts';
import { generateShape } from './shape/generate.mts';
import { directorySource, fetchScriptModules, readSamplesPin } from './shape/locate.mts';
import { SHAPE_OVERRIDES } from './shape/overrides.mts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });

const directory = await fetchScriptModules();
const shape = generateShape(directorySource(directory), { overrides: SHAPE_OVERRIDES });
const files = emitShape(shape, readSamplesPin());

/** Every file under the generated directory, relative to the package. */
const existing = (root: string): string[] =>
    existsSync(root)
        ? readdirSync(root, { recursive: true, withFileTypes: true })
              .filter((entry) => entry.isFile())
              .map((entry) => relative(packageDir, join(entry.parentPath, entry.name)))
        : [];

const stale = existing(join(packageDir, GENERATED_DIR)).filter((file) => !files.has(file));

if (values.check) {
    const differing = [...files].filter(([file, content]) => {
        const path = join(packageDir, file);
        return !existsSync(path) || readFileSync(path, 'utf8') !== content;
    });
    if (differing.length > 0 || stale.length > 0) {
        for (const [file] of differing) console.error(`${file} is out of date`);
        for (const file of stale) console.error(`${file} is no longer generated`);
        console.error('Run `pnpm --filter @jsprismarine/script-host run generate:shape` and commit the result.');
        process.exit(1);
    }
    console.log(`The Script API shape in ${GENERATED_DIR} matches ${directory}`);
} else {
    for (const file of stale) rmSync(join(packageDir, file));
    for (const [file, content] of files) {
        const path = join(packageDir, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
    }
    for (const [id, versions] of shape.applied) console.log(`Override ${id} applied to ${versions.join(', ')}`);
    console.log(`Wrote ${files.size} files to ${GENERATED_DIR} from ${directory}`);
}
