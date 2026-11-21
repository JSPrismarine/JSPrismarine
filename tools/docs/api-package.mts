/**
 * Converts one package for the API reference and writes the project TypeDoc's `packages` strategy
 * would hold for it before merging, as JSON. `api.mts` runs one of these per package and merges the
 * results, the way TypeDoc merges the packages it converts itself.
 *
 *     node --import tsx api-package.mts <package directory> <output JSON>
 *
 * Runs from `tools/docs`, as TypeDoc does: the JSON records source paths relative to it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Application, type JSONOutput, Serializer } from 'typedoc';

const [directory, output] = process.argv.slice(2);
if (directory === undefined || output === undefined) {
    console.error('Usage: api-package.mts <package directory> <output JSON>');
    process.exit(2);
}

const app = await Application.bootstrapWithPlugins({ options: 'typedoc.json', entryPoints: [directory] });

// The `packages` strategy serializes each converted package before it merges them, which is the
// project this file keeps. The merge itself fires no serializer event.
let converted: JSONOutput.ProjectReflection | undefined;
app.serializer.on(Serializer.EVENT_END, (event) => {
    converted ??= event.output;
});
await app.convert();

if (converted === undefined || app.logger.hasErrors()) {
    console.error(`TypeDoc could not convert ${directory}.`);
    process.exit(1);
}
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(converted));
