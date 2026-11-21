import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import AwardAchievementPacket, { AchievementId } from './AwardAchievementPacket';

import type { AwardAchievement } from './AwardAchievementPacket';
import { enumDumpMembers } from '../../testing/evidence.test.helper';

const DATA: AwardAchievement = { achievementId: AchievementId.GettingWood };

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb5, 0x02], // packet id 309 as a varuint32 header
    ...[0x76, 0x00, 0x00, 0x00] // AchievementID 118 (GettingWood), little-endian int32
]);

/** An id outside the enum, to pin that the field is a signed four-byte int32 and not a varint. */
// @ts-expect-error - -1 names no achievement, which is the point: the field is read back as
// whatever the four bytes held.
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

    it('writes and reads the same four bytes at 2193 and 2225, which differ in no field', () => {
        for (const protocol of [2193, 2225]) {
            const writer = new AwardAchievementPacket(DATA);
            writer.codecProtocol = protocol;
            expect([...writer.serialize(new NetworkBinaryStream())]).toEqual([...BYTES]);

            const reader = new AwardAchievementPacket();
            reader.codecProtocol = protocol;
            const stream = new NetworkBinaryStream(BYTES);
            expect(reader.deserialize(stream)).toEqual(DATA);
            expect(stream.feof()).toBe(true);
        }
    });

    it('carries the 2225 achievement WhatGoesAroundComesAround as 127', () => {
        const buffer = new AwardAchievementPacket({
            achievementId: AchievementId.WhatGoesAroundComesAround
        }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([0xb5, 0x02, 0x7f, 0x00, 0x00, 0x00]);
    });

    it('numbers AchievementId as the pinned Mojang enums.html does for every member it lists', () => {
        // Mojang's enum dump covers the numbers 7 to 117. The 1.26.60 type page alone numbers
        // 118 to 127, so those are not asserted here.
        const values = enumDumpMembers('MinecraftEventing::AchievementIds');
        const ours = new Map(
            Object.entries(AchievementId).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        );

        expect(values.length).toBeGreaterThan(0);
        for (const { name, value } of values) expect(ours.get(name)).toBe(value);
    });
});
