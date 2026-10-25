// The capture job's own output type, reached by path rather than through the package, because
// `packages/bedrock-data/utils/` is tooling that ships with no package export. Importing the
// type costs nothing at runtime and is the only way the compiler can tell this suite when the
// job starts writing a different file.
import type { ReferenceWorld } from '../../bedrock-data/utils/bedrock-dump/world.ts';
import { describe, expect, it } from 'vitest';

import type { ReferenceWorldGolden } from './goldens.ts';
import { loadReferenceWorld } from './goldens.ts';
import { REFERENCES } from './references.ts';

/**
 * The reference world is the one golden no checkout here can generate, so the row that waits
 * for it has nothing to run against until CI commits one. These checks are what stands in:
 * that the shape this package reads is the shape the capture job writes, and that a missing or
 * unexpected file says so rather than being read wrong.
 */
describe('the reference world golden', () => {
    it('reads the shape `dump:bedrock` writes', () => {
        // A compile-time check with a runtime body that cannot fail: if the capture job drops a
        // field or changes one's type, this assignment stops compiling and `pnpm typecheck`
        // names the field. Nothing here needs a golden to exist.
        const sameShape = (written: ReferenceWorld): ReferenceWorldGolden => written;

        expect(sameShape).toBeTypeOf('function');
    });

    it('says which file is missing rather than throwing something unreadable', () => {
        if (REFERENCES.referenceWorld.locate() !== undefined) {
            // The golden landed. The loader's job is now the format check, which it does on
            // every read, so there is nothing left for this case to assert.
            expect(loadReferenceWorld().formatVersion).toBe(1);
            return;
        }

        expect(() => loadReferenceWorld()).toThrow(/reference world golden is not in this checkout/);
    });

    it('names the capture job in the reason the dashboard prints', () => {
        expect(REFERENCES.referenceWorld.howToGet).toContain('dump:bedrock');
        expect(REFERENCES.referenceWorld.kind).toBe('unbuilt');
    });
});
