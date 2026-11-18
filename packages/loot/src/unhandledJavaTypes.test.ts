import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../.test/javaRegistries';
import { LOOT_ENTRY_TYPES } from './table';
import { UNHANDLED_LOOT_POOL_ENTRY_TYPE } from './unhandledJavaTypes';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:loot_pool_entry_type',
            handles: (id) => LOOT_ENTRY_TYPES.some((type) => `minecraft:${type}` === id),
            unhandled: UNHANDLED_LOOT_POOL_ENTRY_TYPE
        });
    });
});
