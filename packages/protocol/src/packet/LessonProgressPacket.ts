import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The docs' `Lesson Action`, numbered from 0 as the datagen snapshot lists it. */
export enum LessonAction {
    /** Docs: `Start`. */
    Start = 0,
    /** Docs: `Complete`. */
    Complete = 1,
    /** Docs: `Restart`. */
    Restart = 2
}

/** The fields of a `LessonProgressPacket`, in wire order. */
export interface LessonProgress {
    /** `Lesson Action`, what happened to the lesson. */
    action: LessonAction;
    /** `Score` the player reached in the lesson. */
    score: number;
    /** `Activity Id`, which lesson the packet is about. */
    activityId: string;
}

/**
 * Reports an Education Edition lesson starting, completing or restarting, with the score
 * the player reached.
 *
 * Protocol 2193 layout, in wire order: `Lesson Action` and `Score` as ZigZag varint32s,
 * then `Activity Id` as a string, a varuint32 byte length followed by UTF-8.
 */
export default class LessonProgressPacket extends NetworkPacket<LessonProgress> {
    public get id(): number {
        return PacketIdentifier.LESSON_PROGRESS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LessonProgress): void {
        stream.writeVarInt(data.action);
        stream.writeVarInt(data.score);
        stream.writeString(data.activityId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LessonProgress {
        return {
            action: stream.readVarInt(),
            score: stream.readVarInt(),
            activityId: stream.readString()
        };
    }
}
