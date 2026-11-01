import { RolldownMagicString } from 'rolldown';
import type { Plugin } from 'rolldown';

/** Keeps Yargs package config resolution inside the Node SEA CommonJS bundle. */
export const yargsCjsImportMetaPlugin: Plugin = {
    name: 'yargs-cjs-import-meta-resolve',
    transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/yargs/build/lib/utils/apply-extends.js')) return null;

        // Yargs' platform shim provides the resolver needed when `import.meta.resolve` is unavailable.
        const magicString = new RolldownMagicString(code);
        magicString.replace('import.meta.resolve(config.extends)', 'shim.require.resolve(config.extends)');

        if (!magicString.hasChanged()) return null;

        return {
            code: magicString.toString(),
            map: magicString.generateMap({ source: id, includeContent: true }).toString()
        };
    }
};
