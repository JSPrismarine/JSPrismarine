import { describe, expect, it } from 'vitest';

import { CUSTOM_CRITERION_NAMES, criterionByName, statisticCriterionName } from './criteria';

describe('criterionByName', () => {
    it('knows the custom criteria and which of them only the game raises', () => {
        expect(criterionByName('dummy')).toMatchObject({ kind: 'custom', readOnly: false });
        expect(criterionByName('health')).toMatchObject({ kind: 'custom', readOnly: true, renderType: 'hearts' });
        expect(criterionByName('teamkill.red')).toMatchObject({ kind: 'custom', readOnly: false });
        expect(CUSTOM_CRITERION_NAMES).toContain('killedByTeam.light_purple');
        expect(criterionByName('Dummy')).toBeUndefined();
    });

    it('reads a statistic under the full name Java stores, whichever namespaces it leaves out', () => {
        const full = { kind: 'statistic', name: 'minecraft.custom:minecraft.play_time' };

        expect(criterionByName('minecraft.custom:minecraft.play_time')).toMatchObject(full);
        expect(criterionByName('custom:play_time')).toMatchObject(full);
        expect(criterionByName('custom:play_time')).toMatchObject({
            type: 'minecraft:custom',
            stat: 'minecraft:play_time',
            readOnly: false
        });
        expect(statisticCriterionName('minecraft:mined', 'minecraft:stone')).toBe('minecraft.mined:minecraft.stone');
    });

    it('refuses a statistic its table does not list, and one that is not an id', () => {
        const statistics = { 'minecraft:custom': ['minecraft:play_time'] };

        expect(criterionByName('custom:play_time', statistics)).toBeDefined();
        expect(criterionByName('custom:jump', statistics)).toBeUndefined();
        expect(criterionByName('mined:stone', statistics)).toBeUndefined();
        expect(criterionByName('custom:Play_Time')).toBeUndefined();
        expect(criterionByName('play_time')).toBeUndefined();
    });
});
