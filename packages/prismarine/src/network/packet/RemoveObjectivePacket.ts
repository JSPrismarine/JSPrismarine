import { layoutAt, removeObjectivePacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Removes a scoreboard objective from the client.
 *
 * The client drops the objective and every score filed under it, so this undoes a
 * `SetDisplayObjectivePacket` and the `SetScorePacket` entries that followed it.
 *
 * **Bound To:** Client
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `removeObjectivePacket` definition:
 * Objective Name as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/remove-objective-packet/
 */
export default class RemoveObjectivePacket extends FieldNetworkPacket {
    /** Name the objective was registered under. */
    public objectiveName = '';

    /** Reads the objective name. */
    public decodePayload(): void {
        this.objectiveName = layoutAt(removeObjectivePacket, this.codecProtocol).decode(this).objectiveName;
    }

    /** Writes the objective name. */
    public encodePayload(): void {
        layoutAt(removeObjectivePacket, this.codecProtocol).encode(this, { objectiveName: this.objectiveName });
    }
}
