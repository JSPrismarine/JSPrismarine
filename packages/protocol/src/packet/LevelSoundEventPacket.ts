import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEventName } from '@jsprismarine/minecraft';

import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { levelSoundEventPacket } from '../wire/definitions/levelSoundEvent';

/** The `LevelSoundEvent` number behind each name the wire carries, built once. */
const soundByName = new Map(Object.entries(LevelSoundEventName).map(([value, name]) => [name, Number(value)]));

/**
 * A sound played somewhere in the world.
 *
 * Wire order at protocol 2193: `Sound Event` as a `SoundEventIdentifier`, `Position` as a
 * `Vec3` of three little-endian floats, `Data` as a ZigZag varint32, `Actor Identifier` as a
 * string, `Is Baby` and `Is Global` as one byte each, `Actor Unique Id` as a little-endian
 * int64 (not a varint), then `Fire At Position` as a presence byte followed by a `Vec3` when
 * the byte is set.
 *
 * `SoundEventIdentifier` is the tagged variant Mojang's 1.26.51 notes describe, either a
 * `LevelSoundEvent` member or a free sound name. The metadata types it as one string and
 * nothing precedes it: the enum member travels as its name (`step`, `break`), so a reader
 * cannot tell the two alternatives apart and does not need to. This class keeps the
 * `LevelSoundEvent` number in `sound` and maps it to its name on the way out.
 *
 * The docs page types `Fire At Position` as a plain `Vec3` at 2193 and records the optional
 * from 2207 on. Clients have read a presence byte there since 1.21.70, gophertunnel and
 * PocketMine both write one, and the 2207 entry is the metadata catching up. A bare `Vec3`
 * here would hand the client eleven bytes it does not expect.
 *
 * Clients send this packet for the sounds they start themselves, such as steps and attacks,
 * and `LevelSoundEventHandler` relays those.
 */
export default class LevelSoundEventPacket extends FieldNetworkPacket {
    /**
     * `Sound Event`, held as a `LevelSoundEvent` number and written as its name.
     *
     * Reading a name outside the enum leaves -1 here; the client's own bytes still carry it,
     * so a relay of the decoded packet keeps the name.
     */
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

    /** `Fire At Position`: where a projectile sound was fired from, or null when absent. */
    public fireAtPosition: Vector3 | null = null;

    /** Reads the eight fields in docs order. */
    public decodePayload(): void {
        const read = layoutAt(levelSoundEventPacket, this.codecProtocol).decode(this);
        this.sound = soundByName.get(read.soundName) ?? -1;
        this.positionX = read.position.x;
        this.positionY = read.position.y;
        this.positionZ = read.position.z;
        this.extraData = read.extraData;
        this.entityType = read.entityType;
        this.isBabyMob = read.isBabyMob;
        this.disableRelativeVolume = read.disableRelativeVolume;
        this.entityUniqueId = read.entityUniqueId;
        this.fireAtPosition =
            read.fireAtPosition === null
                ? null
                : new Vector3(read.fireAtPosition.x, read.fireAtPosition.y, read.fireAtPosition.z);
    }

    /** Writes the eight fields in docs order. */
    public encodePayload(): void {
        layoutAt(levelSoundEventPacket, this.codecProtocol).encode(this, {
            soundName: LevelSoundEventName[this.sound] ?? '',
            position: { x: this.positionX, y: this.positionY, z: this.positionZ },
            extraData: this.extraData,
            entityType: this.entityType,
            isBabyMob: this.isBabyMob,
            disableRelativeVolume: this.disableRelativeVolume,
            entityUniqueId: this.entityUniqueId,
            fireAtPosition:
                this.fireAtPosition === null
                    ? null
                    : {
                          x: this.fireAtPosition.getX(),
                          y: this.fireAtPosition.getY(),
                          z: this.fireAtPosition.getZ()
                      }
        });
    }
}
