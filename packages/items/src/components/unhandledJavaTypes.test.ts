import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../../.test/javaRegistries';
import { ITEM_COMPONENT_NAMES } from './catalog';
import { UNHANDLED_DATA_COMPONENT_TYPE } from './unhandledJavaTypes';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has an item component or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:data_component_type',
            handles: (id) => ITEM_COMPONENT_NAMES.includes(id),
            unhandled: UNHANDLED_DATA_COMPONENT_TYPE
        });
    });
});
