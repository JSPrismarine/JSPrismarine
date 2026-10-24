import { LevelSoundEventName } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * A sound played somewhere in the world.
 *
 * Wire order at protocol 2193: `Sound Event` (a `SoundEventIdentifier`, which travels as a
 * string), `Position` (a `Vec3` of three floats), `Data` (varint32), `Actor Identifier`
 * (string), `Is Baby` (boolean), `Is Global` (boolean), `Actor Unique Id` (int64 little
 * endian, not a varint), and `Fire At Position` as an optional `Vec3`.
 *
 * The docs page types `Fire At Position` as a plain `Vec3` at 2193 and only records the
 * optional from 2207 on. gophertunnel at 2193 writes the presence byte, and so does this: a
 * bare `Vec3` would be eleven bytes the client is not reading.
 *
 * Three things here were years out of date, and together they left the packet at least nine
 * bytes short - which a real client reads as running off the end of a malformed packet, and
 * answers by hanging up with `initialconnection-90`. One of these goes out for every block
 * broken, so mining a single block ended the session.
 *
 * - The sound is a **string** and has been since 1.21.130. Written as the number it used to
 *   be, the client reads that number as a string *length* and eats the position that follows.
 * - `Actor Unique Id` was never written at all.
 * - `Fire At Position` was added after it, the same trailing shape that `ActorEventPacket`
 *   and `ChangeDimensionPacket` were each missing.
 */
export default class LevelSoundEventPacket extends DataPacket {
    public static NetID = Identifiers.LevelSoundEventPacket;

    /** `Sound Event`, held as a `LevelSoundEvent` number and written as its name. */
    public sound!: number;

    /** The X of `Position`. */
    public positionX!: number;

    /** The Y of `Position`. */
    public positionY!: number;

    /** The Z of `Position`. */
    public positionZ!: number;

    /** `Data`: whatever the sound needs, such as a block's runtime id for a break. */
    public extraData!: number;

    /** `Actor Identifier`: the entity type making the sound, empty for the world's own. */
    public entityType: string = '';

    /** `Is Baby`: whether the mob making it is a baby, which raises its pitch. */
    public isBabyMob: boolean = false;

    /** `Is Global`: play it at full volume wherever the listener is. */
    public disableRelativeVolume!: boolean;

    /** `Actor Unique Id`: the entity the sound belongs to, or -1 for the world's own. */
    public entityUniqueId: bigint = -1n;

    /** Reads the eight fields in docs order; `Fire At Position` is read and dropped. */
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

    /** Writes the eight fields in docs order, with no `Fire At Position`. */
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
