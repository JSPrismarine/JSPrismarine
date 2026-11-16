import { parseEntityFilter } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import type { TargetEntityType } from './params';
import { targetFamilies } from './support';

const entry = (filters: unknown): TargetEntityType => ({
    filters: parseEntityFilter(filters),
    maxDistance: 16,
    mustSee: false,
    mustSeeForgetDuration: 60,
    walkSpeedMultiplier: 1,
    sprintSpeedMultiplier: 1,
    cooldown: 0
});

const family = (value: string) => ({ test: 'is_family', subject: 'other', value });

describe('targetFamilies', () => {
    it('bounds an any_of by every family it names', () => {
        expect(targetFamilies([entry({ any_of: [family('zombie'), family('husk')] })])).toEqual(
            new Set(['zombie', 'husk'])
        );
    });

    it('bounds an all_of by one child, not by the intersection of children that share no name', () => {
        // A blaze is in both `monster` and `blaze`, so the search must still offer it.
        const families = targetFamilies([
            entry({ all_of: [family('monster'), { any_of: [family('blaze'), family('ghast')] }] })
        ]);
        expect(families).toEqual(new Set(['monster']));
    });

    it('leaves a none_of unbounded', () => {
        expect(targetFamilies([entry({ none_of: [family('creeper')] })])).toBeUndefined();
    });
});
