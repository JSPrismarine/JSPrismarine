import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { anvilDamagePacket } from '../wire/definitions/anvilDamage';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { AnvilDamagePayload } from '../wire/definitions/anvilDamage';

/** A request to damage the anvil at one block position. */
export type AnvilDamage = AnvilDamagePayload;

/**
 * The client asks for an anvil to be damaged after using it. This packet is sent when the
 * server has disabled the Item Stack Net Manager.
 *
 * Protocol 2193 layout: `Block Position` as a `BlockPos`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/anvil-damage-packet/
 */
export default class AnvilDamagePacket extends NetworkPacket<AnvilDamage> {
    public get id(): number {
        return PacketIdentifier.ANVIL_DAMAGE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AnvilDamage): void {
        layoutAt(anvilDamagePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AnvilDamage {
        return layoutAt(anvilDamagePacket, this.codecProtocol).decode(stream);
    }
}
