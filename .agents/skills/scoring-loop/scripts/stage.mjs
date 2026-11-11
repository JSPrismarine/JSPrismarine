/**
 * Stages a round's evidence set for judges under neutral names, so no path a judge sees reveals the
 * round number or which side is newer.
 *
 *   node stage.mjs <judgeRoot> <currentRoundDir> [previousRoundDir]
 *
 * Copies the rounds to `<judgeRoot>/<random id>/A` and `/B` in a random order, or the one round to
 * `/A` when there is no previous round. It makes an empty `scratch/` beside them for the judges'
 * own files, writes the assignment to `<judgeRoot>/../keys/<random id>.json`, outside the directory
 * judges are given, and prints the staged directory. Files are copied, not linked, because a link
 * shows its target path.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3) {
    console.error('usage: node stage.mjs <judgeRoot> <currentRoundDir> [previousRoundDir]');
    process.exit(2);
}

const [root, current, previous] = args.map((path) => resolve(path));
const target = join(root, randomBytes(4).toString('hex'));
const currentIsA = previous === undefined || randomInt(2) === 0;
const key = currentIsA ? { A: current, B: previous } : { A: previous, B: current };

await cp(key.A, join(target, 'A'), { recursive: true });
if (key.B !== undefined) await cp(key.B, join(target, 'B'), { recursive: true });
await mkdir(join(target, 'scratch'), { recursive: true });

const keys = join(dirname(root), 'keys');
await mkdir(keys, { recursive: true });
await writeFile(join(keys, `${target.slice(root.length + 1)}.json`), `${JSON.stringify(key, null, 2)}\n`);
console.log(target);
