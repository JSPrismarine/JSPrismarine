import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), 'jsp-climate-search-bench-'));

try {
    const bundle = await rolldown({ input: path.join(here, 'climateSearch.ts'), platform: 'node' });
    const entry = path.join(work, 'climateSearch.mjs');
    await bundle.write({ file: entry, format: 'esm', codeSplitting: false });
    await bundle.close();
    process.stdout.write(execFileSync(process.execPath, ['--expose-gc', entry], { encoding: 'utf8' }));
} finally {
    rmSync(work, { recursive: true, force: true });
}
