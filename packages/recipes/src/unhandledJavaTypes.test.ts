import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../.test/javaRegistries';
import { RECIPE_TYPES } from './types';
import { UNHANDLED_RECIPE_SERIALIZER } from './unhandledJavaTypes';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:recipe_serializer',
            handles: (id) => RECIPE_TYPES.some((type) => type === id),
            unhandled: UNHANDLED_RECIPE_SERIALIZER
        });
    });
});
