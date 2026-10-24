import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AwardAchievementPacket, { AchievementId } from './AwardAchievementPacket';

import type { AwardAchievement } from './AwardAchievementPacket';

const DATA: AwardAchievement = { achievementId: AchievementId.GettingWood };

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb5, 0x02], // packet id 309 as a varuint32 header
    ...[0x76, 0x00, 0x00, 0x00] // AchievementID 118 (GettingWood), little-endian int32
]);

/** An id outside the enum, to pin that the field is a signed four-byte int32 and not a varint. */
const UNKNOWN: AwardAchievement = { achievementId: -1 };

const UNKNOWN_BYTES = Buffer.from([
    ...[0xb5, 0x02], // packet id 309 as a varuint32 header
    ...[0xff, 0xff, 0xff, 0xff] // AchievementID -1, little-endian int32
]);

describe('AwardAchievementPacket', () => {
    it('writes the achievement id as a little-endian int32 after the header', () => {
        const buffer = new AwardAchievementPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AwardAchievementPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('passes an id outside the enum through as a signed int32', () => {
        const buffer = new AwardAchievementPacket(UNKNOWN).serialize(new NetworkBinaryStream());
        expect([...buffer]).toEqual([...UNKNOWN_BYTES]);

        const stream = new NetworkBinaryStream(UNKNOWN_BYTES);
        expect(new AwardAchievementPacket().deserialize(stream)).toEqual(UNKNOWN);
        expect(stream.feof()).toBe(true);
    });
});
