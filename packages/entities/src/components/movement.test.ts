import { describe, expect, it } from 'vitest';

import { EntityTypes } from '../entityTypes';

/** Resolves one movement component through the entity registry. */
const movementParams = (kind: string, params: Record<string, unknown> = {}) => {
    const types = new EntityTypes();
    const diagnostics = types.load([
        {
            pack: 'test',
            path: 'entities/mover.json',
            data: {
                format_version: '1.21.0',
                'minecraft:entity': {
                    description: { identifier: 'test:mover' },
                    components: { [`minecraft:movement.${kind}`]: params }
                }
            }
        }
    ]);

    expect(diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
    return types.spawn('test:mover').componentParams(`minecraft:movement.${kind}`);
};

describe('movement components', () => {
    it('reads the hop delay of the jump flavor as a range in seconds', () => {
        expect(movementParams('jump', { jump_delay: [0.16, 0.5] })).toMatchObject({ jumpDelay: [0.16, 0.5] });
        expect(movementParams('jump', { jump_delay: 1 })).toMatchObject({ jumpDelay: [1, 1] });
        expect(movementParams('jump')).toMatchObject({ jumpDelay: [0, 0] });
    });

    it('gives the other flavors no hop delay', () => {
        expect(movementParams('basic', { jump_delay: [1, 2] })).not.toHaveProperty('jumpDelay');
    });
});
