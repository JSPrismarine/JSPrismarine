import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../.test/javaRegistries';
import { TRIGGER_TYPES } from './triggers';
import { UNHANDLED_TRIGGER_TYPE } from './unhandledJavaTypes';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a trigger or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:trigger_type',
            handles: (id) => TRIGGER_TYPES.some((type) => `minecraft:${type}` === id),
            unhandled: UNHANDLED_TRIGGER_TYPE
        });
    });
});
