import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAddonSpec } from './addonSpec';

describe('parseAddonSpec', () => {
    const server = path.resolve('/srv/server');

    it('stores a path inside the server folder relative to it, even one whose folder starts with two dots', () => {
        expect(parseAddonSpec('./..draft/warps', server, server).request).toEqual({
            path: path.join('..draft', 'warps')
        });
    });

    it('stores a path outside the server folder as it resolves', () => {
        expect(parseAddonSpec('../packs/warps', server, server).request).toEqual({
            path: path.resolve('/srv/packs/warps')
        });
    });
});
