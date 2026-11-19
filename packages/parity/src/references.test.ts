import { describe, expect, it } from 'vitest';

import { REFERENCES } from './references';

describe('the parity reference sources', () => {
    it('finds every committed source in this checkout', () => {
        const missing = Object.values(REFERENCES)
            .filter((source) => source.kind === 'committed' && source.locate() === undefined)
            .map((source) => source.id);

        expect(missing).toEqual([]);
    });
});
