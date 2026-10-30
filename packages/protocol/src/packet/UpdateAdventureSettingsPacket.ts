import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { updateAdventureSettingsPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The payload of {@link UpdateAdventureSettingsPacket}. */
export type UpdateAdventureSettingsPayload = PayloadOf<typeof updateAdventureSettingsPacket>;

/**
 * Replaces the client's adventure settings.
 *
 * The payload contains five booleans, in order: `No PvM`, `No MvP`, `Immutable World`,
 * `Show Name Tags`, and `Auto Jump`. Ability flags such as flying and invulnerability are
 * carried separately by `UpdateAbilitiesPacket`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-adventure-settings-packet/
 */
export default class UpdateAdventureSettingsPacket extends NetworkPacket<UpdateAdventureSettingsPayload> {
    public get id(): number {
        return PacketIdentifier.UPDATE_ADVENTURE_SETTINGS;
    }

    public constructor(packetData?: UpdateAdventureSettingsPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateAdventureSettingsPayload): void {
        layoutAt(updateAdventureSettingsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateAdventureSettingsPayload {
        return layoutAt(updateAdventureSettingsPacket, this.codecProtocol).decode(stream);
    }
}
