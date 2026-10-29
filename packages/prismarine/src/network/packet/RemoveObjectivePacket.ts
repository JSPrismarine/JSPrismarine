import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Removes a scoreboard objective from the client.
 *
 * The client drops the objective and every score filed under it, so this undoes a
 * `SetDisplayObjectivePacket` and the `SetScorePacket` entries that followed it.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Objective Name as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/remove-objective-packet/
 */
export default class RemoveObjectivePacket extends DataPacket {
    /** Name the objective was registered under. */
    public objectiveName = '';

    /** Reads the objective name. */
    public decodePayload(): void {
        this.objectiveName = NetworkUtil.readString(this);
    }

    /** Writes the objective name. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.objectiveName);
    }
}
