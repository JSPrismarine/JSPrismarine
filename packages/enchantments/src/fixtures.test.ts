import { expect, it } from 'vitest';

import { VANILLA_ENCHANTMENTS, vanillaDefinitions } from '../test/fixtures';

it('parses every vanilla fixture without a diagnostic', () => {
    expect(vanillaDefinitions()).toHaveLength(Object.keys(VANILLA_ENCHANTMENTS).length);
});
