import { describe, expect, it } from 'vitest';

import { EntityTypes } from '../entityTypes';

/** Resolves one navigation component through the entity registry. */
const navigationParams = (kind: string, params: Record<string, unknown> = {}) => {
    const types = new EntityTypes();
    const diagnostics = types.load([
        {
            pack: 'test',
            path: 'entities/navigation.json',
            data: {
                format_version: '1.21.0',
                'minecraft:entity': {
                    description: { identifier: 'test:navigator' },
                    components: { [`minecraft:navigation.${kind}`]: params }
                }
            }
        }
    ]);

    expect(diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
    return types.spawn('test:navigator').componentParams(`minecraft:navigation.${kind}`);
};

describe('navigation component defaults', () => {
    it('takes movement capabilities from the navigation flavor', () => {
        expect(navigationParams('walk')).toMatchObject({ canWalk: true, canFly: false, canSwim: false });
        expect(navigationParams('fly')).toMatchObject({ canWalk: false, canFly: true, canSwim: false });
        expect(navigationParams('hover')).toMatchObject({ canWalk: false, canFly: true, canSwim: false });
        expect(navigationParams('float')).toMatchObject({ canWalk: false, canFly: true, canSwim: false });
        expect(navigationParams('swim')).toMatchObject({ canWalk: true, canFly: false, canSwim: true });
    });

    it('lets explicit capability flags override the flavor defaults', () => {
        expect(navigationParams('fly', { can_fly: false, can_walk: true })).toMatchObject({
            canWalk: true,
            canFly: false
        });
    });
});
