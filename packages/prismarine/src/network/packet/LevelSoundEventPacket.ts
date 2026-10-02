import { LevelSoundEventName } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * A sound played somewhere in the world.
 *
 * Three things here were years out of date, and together they left the packet at least nine
 * bytes short - which a real client reads as running off the end of a malformed packet, and
 * answers by hanging up with `initialconnection-90`. One of these goes out for every block
 * broken, so mining a single block ended the session.
 *
 * - The sound is a **string** and has been since 1.21.130. Written as the number it used to
 *   be, the client reads that number as a string *length* and eats the position that follows.
 * - `EntityUniqueId` - a fixed width 64 bit integer, not a varint - was never written at all.
 * - `FireAtPosition` was added after it, optional, the same trailing shape that
 *   `ActorEventPacket` and `ChangeDimensionPacket` were each missing.
 */
export default class LevelSoundEventPacket extends DataPacket {
    public static NetID = Identifiers.LevelSoundEventPacket;

    public sound!: number;

    public positionX!: number;
    public positionY!: number;
    public positionZ!: number;

    public extraData!: number;
    public entityType: string = '';
    public isBabyMob: boolean = false;
    public disableRelativeVolume!: boolean;

    /** The entity the sound belongs to, or -1 for a sound that belongs to the world. */
    public entityUniqueId: bigint = -1n;

    public decodePayload(): void {
        // Read back as a name, and mapped to the number the rest of this server speaks in.
        const name = NetworkUtil.readString(this);
        const entry = Object.entries(LevelSoundEventName).find(([, value]) => value === name);
        this.sound = entry ? Number(entry[0]) : -1;

        this.positionX = this.readFloatLE();
        this.positionY = this.readFloatLE();
        this.positionZ = this.readFloatLE();

        this.extraData = this.readVarInt();
        this.entityType = NetworkUtil.readString(this);
        this.isBabyMob = this.readBoolean();
        this.disableRelativeVolume = this.readBoolean();
        this.entityUniqueId = this.readLongLE();
        if (this.readBoolean()) {
            this.readFloatLE();
            this.readFloatLE();
            this.readFloatLE();
        }
    }

    public encodePayload(): void {
        NetworkUtil.writeString(this, LevelSoundEventName[this.sound] ?? '');

        this.writeFloatLE(this.positionX);
        this.writeFloatLE(this.positionY);
        this.writeFloatLE(this.positionZ);

        this.writeVarInt(this.extraData);
        NetworkUtil.writeString(this, this.entityType);
        this.writeBoolean(this.isBabyMob);
        this.writeBoolean(this.disableRelativeVolume);
        this.writeLongLE(this.entityUniqueId);
        this.writeBoolean(false); // No fire-at position.
    }
}
