import { layoutAt } from '../wire/WireLayout';
import { setScorePacket } from '../wire/definitions/scoreboard';

import FieldNetworkPacket from '../FieldNetworkPacket';

import type { ScorePacketEntry } from '../wire/definitions/scoreboard';

/**
 * Adds, changes or removes lines on a scoreboard the client is already showing.
 *
 * The objective each entry names has to have arrived in a `SetDisplayObjectivePacket` first.
 * Plain text on a scoreboard is written as a `ChangeFakePlayer` entry, since the other
 * alternatives take their display text from the player or actor they point at.
 *
 * **Bound To:** Client
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `setScorePacket` definition: `Score Info`
 * as a counted list of entries, each one of four alternatives chosen by its own selector.
 *
 * Before protocol 2193 the packet opened with a `ScorePacketType` byte and each entry carried an
 * `IdentityDefinitionType` byte after the score. Mojang's Cereal conversion notes retire that
 * layout; a 1.26.51 client reads the per-entry selector described above.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-score-packet/
 */
export default class SetScorePacket extends FieldNetworkPacket {
    /** The lines to add, change or remove. */
    public entries: ScorePacketEntry[] = [];

    /**
     * Reads every entry, each as its own alternative.
     * @throws when a selector names none of the four alternatives.
     */
    public decodePayload(): void {
        this.entries = layoutAt(setScorePacket, this.codecProtocol).decode(this).entries;
    }

    /** Writes every entry, each as its own alternative. */
    public encodePayload(): void {
        layoutAt(setScorePacket, this.codecProtocol).encode(this, { entries: this.entries });
    }
}
