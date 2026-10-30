import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { readPlayerAuthInput, writePlayerAuthInput } from '../wire/structures/PlayerAuthInput';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { PlayerAuthInput } from '../wire/structures/PlayerAuthInput';

/**
 * The client input packet sent for every movement tick.
 *
 * It carries the client's predicted position, movement and interaction flags, plus optional
 * block actions, item use, inventory requests, and vehicle input. The server's handlers
 * interpret the decoded input; this packet class only reads and writes the Protocol data.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-auth-input-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-auth-input-packet/
 */
export default class PlayerAuthInputPacket extends NetworkPacket<PlayerAuthInput> {
    public get id(): number {
        return PacketIdentifier.PLAYER_AUTH_INPUT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerAuthInput): void {
        writePlayerAuthInput(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerAuthInput {
        return readPlayerAuthInput(stream);
    }
}
