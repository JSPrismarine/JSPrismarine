/**
 * `LessonProgressPacket`: Reports an Education Edition lesson starting, completing or restarting,
 * with the score the player reached.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `LessonProgressPacket` field list. */
export const lessonProgressPacket = definePacket('LessonProgressPacket', {
    /** `Lesson Action`, what happened to the lesson. */
    action: t.varint32,
    /** `Score` the player reached in the lesson. */
    score: t.varint32,
    /** `Activity Id`, which lesson the packet is about. */
    activityId: t.string
});

/** Reports an Education Edition lesson starting, completing or restarting, with the score the player reached. */
export type LessonProgressPayload = PayloadOf<typeof lessonProgressPacket>;
