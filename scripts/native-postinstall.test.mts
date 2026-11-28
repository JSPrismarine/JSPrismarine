import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The packages whose install script downloads a native library build (#3859). */
const packages = ['native-network', 'native-worldgen', 'script-host'];

let root: string | undefined;

afterEach(() => {
    if (root !== undefined) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
});

const write = (file: string, contents: string): void => {
    if (root === undefined) return;
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
};

/**
 * Copies a package's install script into a scratch package and runs it. The installers it may
 * load are stubs that report which one ran. The scratch package links the real package's
 * `node_modules`, so the script finds tsx as it does in a checkout.
 */
const runInstallScript = (name: string, layout: { source: boolean; build: boolean }): string => {
    const packageDir = path.join(repository, 'packages', name);
    root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), `jsp-${name}-postinstall-`)));
    fs.symlinkSync(path.join(packageDir, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    write('scripts/postinstall.mjs', fs.readFileSync(path.join(packageDir, 'scripts', 'postinstall.mjs'), 'utf8'));
    if (layout.source) {
        // An extensionless import, like the package sources a build resolves to: Node cannot
        // load it without tsx.
        write('src/install.ts', "export { installBuild } from './outcome';\n");
        write(
            'src/outcome.ts',
            "export const installBuild = (): { kind: string; path: string; bytes: number } => ({ kind: 'installed', path: 'source', bytes: 0 });\n"
        );
    }
    if (layout.build) {
        write(
            'dist/install.js',
            "export const installBuild = () => ({ kind: 'installed', path: 'build', bytes: 0 });\n"
        );
    }
    return execFileSync(process.execPath, [path.join(root, 'scripts', 'postinstall.mjs')], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
};

describe.each(packages)('%s install script', (name) => {
    it('loads the source installer in a checkout that also has a build', () => {
        expect(runInstallScript(name, { source: true, build: true })).toContain(
            `@jsprismarine/${name}: installed source (0 bytes)`
        );
    });

    it('loads the build in a published package, which has no sources', () => {
        expect(runInstallScript(name, { source: false, build: true })).toContain(
            `@jsprismarine/${name}: installed build (0 bytes)`
        );
    });
});
