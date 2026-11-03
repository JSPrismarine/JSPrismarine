import { describe, expect, it } from 'vitest';

import recipesModule from './generated/v2193/recipes';
import recipes from './generated/v2193/recipes.json' with { type: 'json' };

describe('vanilla recipe data', () => {
    it('matches the generated JSON asset', () => {
        expect(recipesModule).toEqual(recipes);
    });
});
