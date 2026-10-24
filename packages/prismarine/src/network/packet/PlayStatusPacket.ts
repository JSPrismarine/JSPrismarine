import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

import type PlayStatus from '../type/PlayStatus';

/**
 * Tells the client how its login went, and later that the world is ready for it to spawn.
 *
 * Protocol 2193 layout after the header: `Status`, a big-endian int32 holding a `PlayStatus`
 * enum value. Nothing else.
 */
export default class PlayStatusPacket extends DataPacket {
    public static NetID = Identifiers.PlayStatusPacket;

    /** The `Status` field. */
    public status!: PlayStatus;

    /** Writes `Status` as a big-endian int32. */
    public encodePayload(): void {
        this.writeInt(this.status);
    }

    /** Reads `Status` as a big-endian int32. */
    public decodePayload(): void {
        this.status = this.readInt();
    }
}
