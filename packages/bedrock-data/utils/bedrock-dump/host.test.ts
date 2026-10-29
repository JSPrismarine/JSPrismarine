import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { hostNodeArgs, tsxLoader } from './host.ts';

describe('hostNodeArgs', () => {
    it('puts the loader ahead of the script and keeps the script arguments in order', () => {
        expect(hostNodeArgs('/tmp/script.mjs', ['--out', '/tmp/out'])).toEqual([
            '--import',
            tsxLoader(),
            '/tmp/script.mjs',
            '--out',
            '/tmp/out'
        ]);
    });

    it('names the loader by URL, so a child started elsewhere still resolves it', () => {
        expect(tsxLoader()).toMatch(/^file:\/\/\//);
    });

    it('lets a child import a workspace package, which plain Node cannot', () => {
        const source = "import('@jsprismarine/leveldb').then(() => console.log('loaded'));";
        const run = (args: string[]) =>
            spawnSync(process.execPath, args, { cwd: import.meta.dirname, encoding: 'utf8' });

        expect(run(hostNodeArgs('--eval', [source])).stdout).toContain('loaded');
        expect(run(['--eval', source]).stderr).toContain('ERR_MODULE_NOT_FOUND');
    });
});
