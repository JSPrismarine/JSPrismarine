import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `GameTestResultsPacket`, in wire order. */
export interface GameTestResults {
    /** `Succeeded`: the test passed. */
    succeeded: boolean;
    /** `Error`, why the test failed. Empty when it passed. */
    error: string;
    /** `TestName`, the GameTest this result is for, as the request named it. */
    testName: string;
}

/**
 * The outcome of a GameTest the client asked for with a `GameTestRequestPacket`.
 *
 * Protocol 2193 layout, in wire order: `Succeeded` as one byte, then `Error` and `TestName`
 * each as a varuint32 byte length followed by UTF-8.
 */
export default class GameTestResultsPacket extends NetworkPacket<GameTestResults> {
    public get id(): number {
        return PacketIdentifier.GAME_TEST_RESULTS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: GameTestResults): void {
        stream.writeBoolean(data.succeeded);
        stream.writeString(data.error);
        stream.writeString(data.testName);
    }

    protected deserializePayload(stream: NetworkBinaryStream): GameTestResults {
        return {
            succeeded: stream.readBoolean(),
            error: stream.readString(),
            testName: stream.readString()
        };
    }
}
