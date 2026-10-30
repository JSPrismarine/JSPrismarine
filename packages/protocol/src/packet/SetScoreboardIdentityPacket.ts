import { layoutAt } from '../wire/WireLayout';
import { setScoreboardIdentityPacket } from '../wire/definitions/scoreboard';

import FieldNetworkPacket from '../FieldNetworkPacket';

import type { ScoreboardIdentityPacketInfo } from '../wire/definitions/scoreboard';

/** Whether the entries attach an identity or drop one, as the leading byte numbers it. */
export enum ScoreboardIdentityPacketType {
    Update = 0,
    Remove = 1
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
 * The wire layout lives in `@jsprismarine/protocol`'s `setScoreboardIdentityPacket` definition:
 * the packet type as a byte, then the entries as a counted list, each a Scoreboard Id and a
 * Player Unique Id behind its own presence byte.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-scoreboard-identity-packet/
 */
export default class SetScoreboardIdentityPacket extends FieldNetworkPacket {
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
        const read = layoutAt(setScoreboardIdentityPacket, this.codecProtocol).decode(this);
        this.type = read.type;
        this.entries = read.entries;
    }

    /** Writes the action and the entries. */
    public encodePayload(): void {
        layoutAt(setScoreboardIdentityPacket, this.codecProtocol).encode(this, {
            type: this.type,
            entries: this.entries
        });
    }
}
