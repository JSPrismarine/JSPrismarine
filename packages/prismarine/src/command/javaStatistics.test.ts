import { describe, expect, it } from 'vitest';

import { STAT_TYPES } from '@jsprismarine/protocol/java/versions/newest';

import { JAVA_STATISTICS } from './javaStatistics';

describe('JAVA_STATISTICS', () => {
    it('has an entry list for every statistic type Java registers, and for nothing else', () => {
        expect(Object.keys(JAVA_STATISTICS).sort()).toEqual([...STAT_TYPES.entries].sort());
        for (const entries of Object.values(JAVA_STATISTICS)) expect(entries.length).toBeGreaterThan(0);
        expect(JAVA_STATISTICS['minecraft:custom']).toContain('minecraft:play_time');
        expect(JAVA_STATISTICS['minecraft:mined']).toContain('minecraft:stone');
    });
});
