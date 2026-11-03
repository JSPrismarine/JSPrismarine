import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { attachProfiler, profileSpanStarter, ServerProfiler } from './ServerProfiler';

describe('profile span starter', () => {
    it('does not provide a name-building callback without an attached profiler', () => {
        expect(profileSpanStarter({})).toBeUndefined();
    });

    it('records complete spans and closes each one only once', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-profiler-'));
        const previousDirectory = process.env['JSP_DIR'];
        process.env['JSP_DIR'] = directory;

        const owner = {};
        const profiler = new ServerProfiler();
        attachProfiler(owner, profiler);

        try {
            const startProfile = profileSpanStarter(owner);
            if (startProfile === undefined) throw new Error('attached profiler has no span starter');
            const finish = startProfile('World.systems:overworld');
            finish();
            finish();

            const file = await profiler.save();
            if (file === undefined) throw new Error('profiler did not save the completed span');
            // The trace is parsed JSON written by ServerProfiler.save, so its shape is a boundary.
            const trace = JSON.parse(readFileSync(file, 'utf8')) as {
                traceEvents: Array<{ dur?: number; name?: string; ph?: string }>;
            };
            const spans = trace.traceEvents.filter((event) => event.ph === 'X');

            expect(spans).toHaveLength(1);
            expect(spans[0]).toMatchObject({ name: 'World.systems:overworld' });
            expect(spans[0]?.dur).toBeGreaterThanOrEqual(0);
        } finally {
            if (previousDirectory === undefined) delete process.env['JSP_DIR'];
            else process.env['JSP_DIR'] = previousDirectory;
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
