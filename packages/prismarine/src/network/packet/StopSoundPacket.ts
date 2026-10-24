import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Stops a sound that is still playing, such as a music disc.
 *
 * Wire order at protocol 2193: `Sound Name` as a string, then `Stop All Sounds?` and
 * `Stop Music (Legacy)` as one byte each. A client that is not playing the named sound
 * ignores the packet. With `stopAllSounds` set the name may be empty.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/stop-sound-packet/
 */
export default class StopSoundPacket extends DataPacket {
    public static NetID = Identifiers.StopSoundPacket;

    public soundName = '';

    /** Stops everything the client is playing, whatever `soundName` says. */
    public stopAllSounds = false;

    /** The older music-only stop, kept for clients that still read it. */
    public stopMusicLegacy = false;

    /** Reads the sound name and the two stop flags. */
    public decodePayload(): void {
        this.soundName = NetworkUtil.readString(this);
        this.stopAllSounds = this.readBoolean();
        this.stopMusicLegacy = this.readBoolean();
    }

    /** Writes the sound name and the two stop flags. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.soundName);
        this.writeBoolean(this.stopAllSounds);
        this.writeBoolean(this.stopMusicLegacy);
    }
}
