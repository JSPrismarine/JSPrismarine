import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import {
    PackSettingValueType,
    serverboundPackSettingChangePacket
} from '../wire/definitions/serverboundPackSettingChange';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PackSettingValue, ServerboundPackSettingChange } from '../wire/definitions/serverboundPackSettingChange';

export { PackSettingValueType };
export type { PackSettingValue, ServerboundPackSettingChange };

/**
 * Reports a changed resource pack setting. The server must match the value's type to one of
 * the packet's four tagged alternatives; unknown selector values are malformed packets.
 *
 * Protocol 2193 layout: `Pack Id` as an `mce::UUID`, `Pack Setting Name` as a string, then
 * `Pack Setting Value` as a varuint32 selector and a float, boolean, string, or string list.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-pack-setting-change-packet/
 */
export default class ServerboundPackSettingChangePacket extends NetworkPacket<ServerboundPackSettingChange> {
    public get id(): number {
        return PacketIdentifier.SERVERBOUND_PACK_SETTING_CHANGE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundPackSettingChange): void {
        layoutAt(serverboundPackSettingChangePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundPackSettingChange {
        return layoutAt(serverboundPackSettingChangePacket, this.codecProtocol).decode(stream);
    }
}
