import { describe, expect, it } from 'vitest';

import turbo from '../turbo.json' with { type: 'json' };

/** Every package's `build` runs `emit-dts.mts`, which imports `declaration-specifiers.mts`. */
describe('turbo build cache', () => {
    it('invalidates builds when a declaration emit script changes', () => {
        expect(turbo.globalDependencies).toContain('scripts/emit-dts.mts');
        expect(turbo.globalDependencies).toContain('scripts/declaration-specifiers.mts');
    });
});
