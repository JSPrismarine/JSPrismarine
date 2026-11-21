/**
 * `AwardAchievementPacket`: awards one achievement to the receiving player.
 *
 * The payload is a single `AchievementID` written as a little-endian int32, four bytes and not a
 * varint.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { AchievementId } from '../../packet/AwardAchievementPacket';
import type { PayloadOf } from '../../../wire/define';

/**
 * `li32` typed as an {@link AchievementId}. The wire carries any int32, and a value outside the
 * enum passes through unchanged, so the read side hands back the number as the enum type.
 */
const achievementId = t.custom<AchievementId>(
    'li32',
    (stream, value) => stream.writeIntLE(value),
    (stream) => stream.readIntLE()
);

/** The fields sent when the server awards one achievement. */
export const awardAchievementPacket = definePacket('AwardAchievementPacket', {
    /**
     * `AchievementID`: which achievement to award. The docs type it as a bare int32; the numbers
     * are the `AchievementId` members, and gophertunnel calls them unknown, so a value outside the
     * enum passes through.
     */
    achievementId
});

/** Payload carried by `AwardAchievementPacket`. */
export type AwardAchievementPayload = PayloadOf<typeof awardAchievementPacket>;
