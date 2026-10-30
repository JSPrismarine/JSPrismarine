import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { setDifficultyPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `Difficulty` value sent by {@link SetDifficultyPacket}. */
export type SetDifficultyPayload = PayloadOf<typeof setDifficultyPacket>;

/**
 * Reports a difficulty change from the client settings menu or tells the client the server's
 * current difficulty.
 *
 * The payload is one `Difficulty` varuint32: 0 Peaceful, 1 Easy, 2 Normal, or 3 Hard.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-difficulty-packet/
 */
export default class SetDifficultyPacket extends NetworkPacket<SetDifficultyPayload> {
    public get id(): number {
        return PacketIdentifier.SET_DIFFICULTY;
    }

    public constructor(packetData?: SetDifficultyPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetDifficultyPayload): void {
        layoutAt(setDifficultyPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetDifficultyPayload {
        return layoutAt(setDifficultyPacket, this.codecProtocol).decode(stream);
    }
}
