import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { gameTestRequestPacket } from '../wire/definitions/gameTestRequest';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { GameTestRequestPayload } from '../wire/definitions/gameTestRequest';

/**
 * The docs' `Rotation`, how far a structure is turned when it is placed.
 *
 * `Clockwise90`, `Clockwise180` and `CounterClockwise90` are other names for 1, 2 and 3, not
 * members 4, 5 and 6 as the rendered page lists them. The datagen snapshot in
 * `packages/minecraft` numbers them that way, and the page's own 2207 changelog "moves" them
 * back down to 1, 2 and 3. `GameTestRequestPacket.test.ts` asserts the numbers against Mojang's
 * pinned `enums.html` dump, so the values hold at protocol 2193 and 2225 alike.
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
export type GameTestRequest = GameTestRequestPayload;

/**
 * A client's request to run a GameTest (the `/gametest run` family of commands).
 *
 * Protocol 2193 layout, in wire order: `MaxTestsPerBatch` and `RepeatCount` as ZigZag
 * varint32, `Rotation` as one byte, `StopOnFailure` as one byte, `TestPos` as a
 * {@link BlockPos} (three ZigZag varint32), `TestsPerRow` as a ZigZag varint32, then
 * `TestName` as a varuint32 byte length followed by UTF-8. Protocol 2225 changes nothing. The
 * server answers with a `GameTestResultsPacket` once the test finishes.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/game-test-request-packet/
 */
export default class GameTestRequestPacket extends NetworkPacket<GameTestRequest> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'GameTestRequestPacket';
    }

    public get id(): number {
        return PacketIdentifier.GAME_TEST_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: GameTestRequest): void {
        layoutAt(gameTestRequestPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): GameTestRequest {
        return layoutAt(gameTestRequestPacket, this.codecProtocol).decode(stream);
    }
}
