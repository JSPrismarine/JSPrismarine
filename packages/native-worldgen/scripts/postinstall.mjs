/**
 * The package's install script: downloads the native library's build for this machine from the
 * GitHub release the manifest names, checks its SHA-256, and stores it in the package. It never
 * fails the install; a machine without a build learns why when the library is first loaded.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The published package carries `dist/`; a checkout imports the source through tsx. A checkout
 * checks for `src/` first even when it has a build: without the `jsprismarine:dist` condition, the
 * built file's `@jsprismarine/native-library` import resolves to that package's TypeScript sources,
 * which plain Node cannot load.
 */
const loadInstaller = async () => {
    const source = join(packageDir, 'src', 'install.ts');
    if (!existsSync(source)) return import(pathToFileURL(join(packageDir, 'dist', 'install.js')).href);
    try {
        const { tsImport } = await import('tsx/esm/api');
        return await tsImport(pathToFileURL(source).href, import.meta.url);
    } catch {
        return undefined;
    }
};

const prefix = '@jsprismarine/native-worldgen:';
try {
    const installer = await loadInstaller();
    if (installer === undefined) {
        console.log(`${prefix} skipped, nothing to run the installer with yet`);
    } else {
        const outcome = await installer.installBuild({ packageDir });
        switch (outcome.kind) {
            case 'installed':
                console.log(`${prefix} installed ${outcome.path} (${outcome.bytes} bytes)`);
                break;
            case 'present':
                break;
            case 'no-build':
                console.warn(
                    `${prefix} no build is published for ${outcome.platform}; terrain generation uses the TypeScript noise here`
                );
                break;
            case 'skipped':
                console.log(`${prefix} download skipped`);
                break;
            case 'local-sources':
                console.log(
                    `${prefix} the native sources (${outcome.sourceHash}) differ from the published builds; run \`pnpm --filter @jsprismarine/native-worldgen run build:native\``
                );
                break;
        }
    }
} catch (error) {
    console.warn(
        `${prefix} could not install the native library: ${error instanceof Error ? error.message : String(error)}`
    );
}
