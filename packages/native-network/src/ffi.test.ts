import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { NativeLibraryError, NativeNetworkErrors } from '@jsprismarine/errors/native-network';

import { nodeFfiOf } from './ffi';

describe('nodeFfiOf', () => {
    it('names the node:ffi requirement when the runtime has no FFI', () => {
        // What `process.getBuiltinModule('node:ffi')` answers under `--no-experimental-ffi`.
        const missing = () => nodeFfiOf(undefined, 'v26.0.0');

        expect(missing).toThrow(NativeLibraryError);
        expect(missing).toThrow(/node:ffi is not available in Node\.js v26\.0\.0.*--no-experimental-ffi/);
    });
});

describe('NativeNetwork.load', () => {
    it('refuses with FfiUnavailable, not LibraryDoesNotLoad, on a Node.js started without FFI', () => {
        // A process of its own, since FFI is decided at startup. The path is never opened: the
        // loader stops at the missing module first.
        // A file URL rather than a path, which `import()` takes on Windows as well.
        const module = new URL('./NativeNetwork.ts', import.meta.url).href;
        const script = `
            const { NativeNetwork } = await import(${JSON.stringify(module)});
            try {
                await NativeNetwork.load({ path: 'libjsp_native_network.so' });
                console.log('loaded');
            } catch (error) {
                console.log(error.code);
            }
        `;
        const child = spawnSync(
            process.execPath,
            ['--no-experimental-ffi', '--import', 'tsx', '--input-type=module', '-e', script],
            { encoding: 'utf8' }
        );

        expect(child.stdout.trim()).toBe(new NativeNetworkErrors.FfiUnavailable({ version: '' }).code);
    });
});
