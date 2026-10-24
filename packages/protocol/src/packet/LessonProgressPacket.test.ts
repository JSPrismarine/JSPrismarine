import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import LessonProgressPacket, { LessonAction } from './LessonProgressPacket';

import type { LessonProgress } from './LessonProgressPacket';

const DATA: LessonProgress = {
    action: LessonAction.Complete,
    score: 100,
    activityId: 'lesson-42'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb7, 0x01], // packet id 183 as a varuint32 header
    0x02, // Lesson Action Complete (1), ZigZag varint32
    ...[0xc8, 0x01], // Score 100, ZigZag varint32
    ...[0x09, ...Buffer.from('lesson-42', 'utf8')] // Activity Id
]);

describe('LessonProgressPacket', () => {
    it('numbers the lesson actions as the datagen snapshot does', () => {
        expect(LessonAction.Start).toBe(0);
        expect(LessonAction.Complete).toBe(1);
        expect(LessonAction.Restart).toBe(2);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new LessonProgressPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new LessonProgressPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a restart with a negative score', () => {
        const input: LessonProgress = { action: LessonAction.Restart, score: -7, activityId: '' };
        const buffer = new LessonProgressPacket(input).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([0xb7, 0x01, 0x04, 0x0d, 0x00]);
        expect(new LessonProgressPacket().deserialize(new NetworkBinaryStream(buffer))).toEqual(input);
    });
});
