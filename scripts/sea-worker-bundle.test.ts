import { rewriteSeaWorkerRequireBase } from './sea-worker-bundle';

describe('rewriteSeaWorkerRequireBase', () => {
    it('lets a self-contained worker bundle import from a data URL', async () => {
        const source = [
            "import { createRequire } from 'node:module';",
            'const require = createRequire(import.meta.url);',
            "export const basename = require('node:path').basename('/tmp/chunk');"
        ].join('\n');
        const rewritten = rewriteSeaWorkerRequireBase(source);
        const moduleUrl = `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`;

        const module = await import(moduleUrl);

        expect(module.basename).toBe('chunk');
    });
});
