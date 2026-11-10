/**
 * CLI for the client e2e workflow: prints the cinnabar builds CI runs as a JSON array of
 * `{ protocol, transport, commit, name }`, one per pin of a served protocol. `name` is what the
 * pin's caches go by, so the workflow derives its cache keys from it instead of rebuilding the
 * naming. `--latest-only` keeps the newest served protocol's pins.
 */
import { parseArgs } from 'node:util';

import { pinMatrix } from './cinnabar.mts';

const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== '--'),
    options: { 'latest-only': { type: 'boolean', default: false } }
});

console.log(JSON.stringify(pinMatrix(values['latest-only'])));
