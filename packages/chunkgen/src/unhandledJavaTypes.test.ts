import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../.test/javaRegistries';
import { CHUNK_STATUSES } from './ChunkStatus';
import { UNHANDLED_CHUNK_STATUS } from './unhandledJavaTypes';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a status or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:chunk_status',
            handles: (id) => CHUNK_STATUSES.some((type) => `minecraft:${type}` === id),
            unhandled: UNHANDLED_CHUNK_STATUS
        });
    });
});
