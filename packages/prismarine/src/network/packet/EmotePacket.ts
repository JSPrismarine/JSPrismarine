import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** Bits of the Flags byte in an `EmotePacket`. */
export enum EmoteFlags {
    /** Set by the server on the copy it relays, so clients do not treat it as their own request. */
    ServerSide = 1 << 0,
    /** The emote's chat message should not be shown. */
    MuteChat = 1 << 1
}

/**
 * An emote, sent by a client to play one and by the server to show it on another player.
 *
 * Wire layout at protocol 2193: Actor Runtime Id as a varuint64, Emote Id as a string (the
 * emote piece UUID), Emote Length Ticks as a varuint32, Xuid and PlatformId as strings, then
 * Flags as a uint8, see {@link EmoteFlags}.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/emote-packet/
 */
export default class EmotePacket extends DataPacket {
    public static NetID = Identifiers.EmotePacket;

    /** Runtime id of the player performing the emote. */
    public actorRuntimeId = 0n;

    /** The emote piece UUID as a string. */
    public emoteId = '';

    /** How long the emote plays, in ticks. */
    public emoteLengthTicks = 0;

    public xuid = '';
    public platformId = '';
    public flags = 0;

    /** Reads the six fields. */
    public decodePayload(): void {
        this.actorRuntimeId = this.readUnsignedVarLong();
        this.emoteId = NetworkUtil.readString(this);
        this.emoteLengthTicks = this.readUnsignedVarInt();
        this.xuid = NetworkUtil.readString(this);
        this.platformId = NetworkUtil.readString(this);
        this.flags = this.readByte();
    }

    /** Writes the six fields. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.actorRuntimeId);
        NetworkUtil.writeString(this, this.emoteId);
        this.writeUnsignedVarInt(this.emoteLengthTicks);
        NetworkUtil.writeString(this, this.xuid);
        NetworkUtil.writeString(this, this.platformId);
        this.writeByte(this.flags);
    }
}
