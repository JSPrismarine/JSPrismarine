import { describe, expect, it } from 'vitest';

import { packagesToRerun } from './vitest-changed-files.ts';

const roots = ['packages/raknet', 'packages/server', 'tools/client-e2e', 'packages/server/fixtures/pack'];

describe('packagesToRerun', () => {
    it('leaves a changed module to the import graph', () => {
        expect(packagesToRerun(['packages/raknet/src/Session.ts', 'packages/server/src/cli.mts'], roots)).toEqual([]);
    });

    it.each([
        'packages/raknet/package.json',
        'packages/raknet/tsconfig.test.json',
        'packages/raknet/vite.config.ts',
        'packages/raknet/vitest.config.ts',
        'packages/raknet/README.md',
        'packages/raknet/goldens/frames.json'
    ])('reruns the package that owns %s', (file) => {
        expect(packagesToRerun([file], roots)).toEqual(['packages/raknet']);
    });

    it('names each package once', () => {
        const changed = [
            'packages/raknet/package.json',
            'packages/raknet/tsconfig.json',
            'tools/client-e2e/cinnabar.json'
        ];

        expect(packagesToRerun(changed, roots)).toEqual(['packages/raknet', 'tools/client-e2e']);
    });

    it('gives a file to the innermost package that holds it', () => {
        expect(packagesToRerun(['packages/server/fixtures/pack/manifest.json'], roots)).toEqual([
            'packages/server/fixtures/pack'
        ]);
    });

    it('ignores a file outside every package', () => {
        expect(packagesToRerun(['package.json', 'docs/guide/running.md', 'packages/README.md'], roots)).toEqual([]);
    });
});
