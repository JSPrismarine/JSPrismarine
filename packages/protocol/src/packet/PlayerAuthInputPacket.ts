import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { playerAuthInputPacket } from '../wire/definitions/playerAuthInput';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { PlayerAuthInput } from '../wire/structures/PlayerAuthInput';

/**
 * The client input packet sent for every movement tick.
 *
 * It carries the client's predicted position, movement and interaction flags, plus optional
 * block actions, item use, inventory requests, and vehicle input. The server's handlers
 * interpret the decoded input; this packet class only reads and writes the Protocol data.
 * The wire layout lives in the declarative definition, which this class walks at the protocol
 * version stamped on it; the item stack request travels under the key its version's action
 * ids use, and this class folds the pair into one `itemStackRequest`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-auth-input-packet/
 */
export default class PlayerAuthInputPacket extends NetworkPacket<PlayerAuthInput> {
    public get id(): number {
        return PacketIdentifier.PLAYER_AUTH_INPUT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerAuthInput): void {
        const { itemStackRequest, ...rest } = data;
        layoutAt(playerAuthInputPacket, this.codecProtocol).encode(stream, {
            ...rest,
            itemStackRequestUntil2225: itemStackRequest,
            itemStackRequestSince2225: itemStackRequest
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerAuthInput {
        const { itemStackRequestUntil2225, itemStackRequestSince2225, ...rest } = layoutAt(
            playerAuthInputPacket,
            this.codecProtocol
        ).decode(stream);
        return { ...rest, itemStackRequest: itemStackRequestUntil2225 ?? itemStackRequestSince2225 };
    }
}
