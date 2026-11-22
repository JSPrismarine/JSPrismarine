import { describe, expect, it } from 'vitest';

import { namedPackages, withoutSkipped } from './check-changesets.mts';

const MIXED = `---
"@jsprismarine/addon-tps-bar": patch
'@jsprismarine/packs': patch
---

chore(deps): update all non-major dependencies
`;

const released = (name: string): boolean => !name.startsWith('@jsprismarine/addon-');

describe('check-changesets', () => {
    it('reads the packages a changeset names, quoted either way', () => {
        expect(namedPackages(MIXED)).toEqual(['@jsprismarine/addon-tps-bar', '@jsprismarine/packs']);
    });

    it('drops the packages Changesets skips and keeps the rest of the file', () => {
        expect(withoutSkipped(MIXED, released)).toBe(`---
'@jsprismarine/packs': patch
---

chore(deps): update all non-major dependencies
`);
    });

    it('answers no file for a changeset that names only skipped packages', () => {
        expect(withoutSkipped(`---\n"@jsprismarine/addon-tab-list": patch\n---\n\nbump\n`, released)).toBeUndefined();
    });

    it('reads nothing from a file without front matter', () => {
        expect(namedPackages('just text\n')).toEqual([]);
    });
});
