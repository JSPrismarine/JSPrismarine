/**
 * `LevelSoundEventPacket` described as a declarative field list; layout unchanged between
 * protocols 2193 and 2225. Field names and order follow the docs page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-sound-event-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * The `LevelSoundEventPacket` field list.
 *
 * `Sound Event` is the tagged `SoundEventIdentifier` variant Mojang's 1.26.51 notes describe,
 * either a `LevelSoundEvent` member or a free sound name. The metadata types it as one string
 * and nothing precedes it: the enum member travels as its name (`step`, `break`), so a reader
 * cannot tell the two alternatives apart and does not need to.
 *
 * The docs page types `Fire At Position` as a plain `Vec3` at 2193 and records the optional
 * from 2207 on. Clients have read a presence byte there since 1.21.70, gophertunnel and
 * PocketMine both write one, and the 2207 entry is the metadata catching up. A bare `Vec3`
 * here would hand the client eleven bytes it does not expect.
 */
export const levelSoundEventPacket = definePacket('LevelSoundEventPacket', {
    /** `Sound Event` as its name on the wire. */
    soundName: t.string,
    /** `Position`: where the sound plays. */
    position: t.vec3,
    /** `Data`: whatever the sound needs, such as a block's runtime id for a break. */
    extraData: t.varint32,
    /** `Actor Identifier`: the entity type making the sound, empty for the world's own. */
    entityType: t.string,
    /** `Is Baby`: whether the mob making it is a baby, which raises its pitch. */
    isBabyMob: t.bool,
    /** `Is Global`: play it at full volume wherever the listener is. */
    disableRelativeVolume: t.bool,
    /** `Actor Unique Id`: a little-endian int64, not a varint. -1 for the world's own. */
    entityUniqueId: t.li64,
    /** `Fire At Position`: where a projectile sound was fired from, behind a presence byte. */
    fireAtPosition: t.optional(t.vec3)
});
