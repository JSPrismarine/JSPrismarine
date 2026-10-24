import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `Rotation`, how far a structure is turned when it is placed.
 *
 * `Clockwise90`, `Clockwise180` and `CounterClockwise90` are other names for 1, 2 and 3, not
 * members 4, 5 and 6 as the rendered page lists them. The datagen snapshot in
 * `packages/minecraft` numbers them that way, and the page's own 2207 changelog "moves" them
 * back down to 1, 2 and 3.
 */
export enum Rotation {
    /** Docs: `None`. */
    None = 0,
    /** Docs: `Rotate90`. */
    Rotate90 = 1,
    /** Docs: `Rotate180`. */
    Rotate180 = 2,
    /** Docs: `Rotate270`. */
    Rotate270 = 3,
    /** Docs: `Clockwise90`, the same value as {@link Rotation.Rotate90}. */
    Clockwise90 = 1,
    /** Docs: `Clockwise180`, the same value as {@link Rotation.Rotate180}. */
    Clockwise180 = 2,
    /** Docs: `CounterClockwise90`, the same value as {@link Rotation.Rotate270}. */
    CounterClockwise90 = 3
}

/** The fields of a `GameTestRequestPacket`, in wire order. */
export interface GameTestRequest {
    /** `MaxTestsPerBatch`, how many tests may run at once. */
    maxTestsPerBatch: number;
    /** `RepeatCount`, how many times to run each test. */
    repeatCount: number;
    /** `Rotation` to place the test structure with. */
    rotation: Rotation;
    /** `StopOnFailure`: stop the batch at the first failed test. */
    stopOnFailure: boolean;
    /** `TestPos`, the block the first test structure is placed at. */
    testPosition: BlockPos;
    /** `TestsPerRow`, how many test structures to lay out before starting a new row. */
    testsPerRow: number;
    /** `TestName`, the GameTest to run, for example `farm:crops`. */
    testName: string;
}

/**
 * A client's request to run a GameTest (the `/gametest run` family of commands).
 *
 * Protocol 2193 layout, in wire order: `MaxTestsPerBatch` and `RepeatCount` as ZigZag
 * varint32, `Rotation` as one byte, `StopOnFailure` as one byte, `TestPos` as a
 * {@link BlockPos} (three ZigZag varint32), `TestsPerRow` as a ZigZag varint32, then
 * `TestName` as a varuint32 byte length followed by UTF-8. The server answers with a
 * `GameTestResultsPacket` once the test finishes.
 */
export default class GameTestRequestPacket extends NetworkPacket<GameTestRequest> {
    public get id(): number {
        return PacketIdentifier.GAME_TEST_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: GameTestRequest): void {
        stream.writeVarInt(data.maxTestsPerBatch);
        stream.writeVarInt(data.repeatCount);
        stream.writeByte(data.rotation);
        stream.writeBoolean(data.stopOnFailure);
        data.testPosition.serialize(stream);
        stream.writeVarInt(data.testsPerRow);
        stream.writeString(data.testName);
    }

    protected deserializePayload(stream: NetworkBinaryStream): GameTestRequest {
        return {
            maxTestsPerBatch: stream.readVarInt(),
            repeatCount: stream.readVarInt(),
            rotation: stream.readByte(),
            stopOnFailure: stream.readBoolean(),
            testPosition: BlockPos.deserialize(stream),
            testsPerRow: stream.readVarInt(),
            testName: stream.readString()
        };
    }
}
