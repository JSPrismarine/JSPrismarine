import { WriteBatch } from '@jsprismarine/leveldb';
import { describe, expect, it } from 'vitest';

import { OverlayBatch } from './OverlayBatch';

const key = (name: string) => Buffer.from(name, 'ascii');

describe('an overlay batch', () => {
    it('keeps one write per key, the latest, in the order each key was last written', () => {
        const batch = new OverlayBatch().put(key('a'), key('1')).put(key('b'), key('2')).del(key('a'));

        expect(batch.lookup(key('a'))).toBeNull();
        expect(batch.lookup(key('b'))).toEqual(key('2'));
        expect(batch.lookup(key('c'))).toBeUndefined();
        expect([...batch.entries()].map(({ key }) => key.toString('ascii'))).toEqual(['b', 'a']);
        expect(batch.approximateSize).toBe(new WriteBatch().put(key('b'), key('2')).del(key('a')).approximateSize);
    });

    it('lets an appended batch win a shared key', () => {
        const batch = new OverlayBatch().put(key('a'), key('old')).append(new OverlayBatch().put(key('a'), key('new')));

        expect(batch.count).toBe(1);
        expect(
            batch
                .toWriteBatch()
                .entries()
                .map(({ value }) => value?.toString('ascii'))
        ).toEqual(['new']);
    });
});
