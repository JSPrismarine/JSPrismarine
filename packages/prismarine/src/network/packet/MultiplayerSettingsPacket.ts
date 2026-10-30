import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** What a `MultiplayerSettingsPacket` asks for, as the PacketType varint32 numbers it. */
export enum MultiplayerSettingsPacketType {
    EnableMultiplayer = 0,
    DisableMultiplayer = 1,
    RefreshJoincode = 2
}

/**
 * A change to the multiplayer settings of an Education Edition session.
 *
 * The client sends it when a teacher opens or closes the session or asks for a fresh join
 * code, and the server sends the same packet back to the players in the session. The base
 * game has no screen that produces it.
 *
 * Wire order at protocol 2193: PacketType as a ZigZag varint32 (see
 * {@link MultiplayerSettingsPacketType}).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/multiplayer-settings-packet/
 */
export default class MultiplayerSettingsPacket extends FieldNetworkPacket {
    /** PacketType: the single setting this packet carries. */
    public packetType: MultiplayerSettingsPacketType = MultiplayerSettingsPacketType.EnableMultiplayer;

    /** Reads PacketType as a varint32. */
    public decodePayload(): void {
        this.packetType = this.readVarInt();
    }

    /** Writes PacketType as a varint32. */
    public encodePayload(): void {
        this.writeVarInt(this.packetType);
    }
}
