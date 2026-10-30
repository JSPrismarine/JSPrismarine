import { emotePacket, layoutAt } from '@jsprismarine/protocol';

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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/emote-packet/
 */
export default class EmotePacket extends DataPacket {
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
        const read = layoutAt(emotePacket, this.codecProtocol).decode(this);
        this.actorRuntimeId = read.actorRuntimeId;
        this.emoteId = read.emoteId;
        this.emoteLengthTicks = read.emoteLengthTicks;
        this.xuid = read.xuid;
        this.platformId = read.platformId;
        this.flags = read.flags;
    }

    /** Writes the six fields. */
    public encodePayload(): void {
        layoutAt(emotePacket, this.codecProtocol).encode(this, {
            actorRuntimeId: this.actorRuntimeId,
            emoteId: this.emoteId,
            emoteLengthTicks: this.emoteLengthTicks,
            xuid: this.xuid,
            platformId: this.platformId,
            flags: this.flags
        });
    }
}
