import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../.test/javaRegistries';
import { SENSOR_TYPE_NAMES } from './sensing/sensors.js';
import { UNHANDLED_SENSOR_TYPE } from './unhandledJavaTypes.js';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a sensor or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:sensor_type',
            handles: (id) => SENSOR_TYPE_NAMES.some((type) => `minecraft:${type}` === id),
            unhandled: UNHANDLED_SENSOR_TYPE
        });
    });
});
