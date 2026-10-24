import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** Whether the entries attach an identity or drop one, as the leading byte numbers it. */
export enum ScoreboardIdentityPacketType {
    Update = 0,
    Remove = 1
}

/** One scoreboard entry and the player it stands for. */
export interface ScoreboardIdentityPacketInfo {
    /** The scoreboard entry, the same id `SetScorePacket` files scores under. */
    scoreboardId: bigint;

    /** Unique id of the player the entry points at. Present on `Update`, absent on `Remove`. */
    playerUniqueId?: bigint;
}

/**
 * Points scoreboard entries at players, or stops pointing them at anything.
 *
 * An entry with an identity takes its display name from that player, so the name follows a
 * rename. A player leaving is handled by clearing the identity, which leaves the line showing
 * whatever text it was last given.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Scoreboard Identity Packet Type as a byte, then Scoreboard
 * Identity Info as a varuint32 count of entries, each a Scoreboard Id as a ZigZag varint64 and
 * an optional Player Unique Id as a ZigZag varint64.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/set-scoreboard-identity-packet/
 */
export default class SetScoreboardIdentityPacket extends DataPacket {
    public static NetID = Identifiers.SetScoreboardIdentityPacket;

    public type: ScoreboardIdentityPacketType = ScoreboardIdentityPacketType.Update;

    /** The entries whose identity is being set or cleared. */
    public entries: ScoreboardIdentityPacketInfo[] = [];

    /**
     * Reads the action and the entries.
     *
     * The presence byte is read per entry rather than assumed from the action, because it is
     * what the wire says. A `Remove` carrying one anyway still decodes.
     */
    public decodePayload(): void {
        this.type = this.readByte();
        this.entries = [];

        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            const entry: ScoreboardIdentityPacketInfo = { scoreboardId: this.readVarLong() };
            if (this.readBoolean()) entry.playerUniqueId = this.readVarLong();
            this.entries.push(entry);
        }
    }

    /** Writes the action and the entries. */
    public encodePayload(): void {
        this.writeByte(this.type);
        this.writeUnsignedVarInt(this.entries.length);

        for (const entry of this.entries) {
            this.writeVarLong(entry.scoreboardId);

            if (entry.playerUniqueId === undefined) {
                this.writeBoolean(false);
            } else {
                this.writeBoolean(true);
                this.writeVarLong(entry.playerUniqueId);
            }
        }
    }
}
