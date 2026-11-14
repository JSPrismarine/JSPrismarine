/**
 * `SpawnExperienceOrbPacket`: spawns an experience orb on the client without an accompanying
 * actor-add packet. The client uses the experience value to choose the orb's displayed size.
 *
 * Protocol 2193 and 2225 layout (docs id 66, identical in both): `Position` as three little-endian floats, followed by
 * `XP Value` as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/spawn-experience-orb-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields sent when an experience orb is spawned on a client. */
export const spawnExperienceOrbPacket = definePacket('SpawnExperienceOrbPacket', {
    /** `Position`: where the client should display the orb, as three little-endian floats. */
    position: vec3Structure,
    /** `XP Value`: the experience points the orb carries, as a ZigZag varint32. */
    xpValue: t.varint32
});

/** Data needed to spawn an experience orb actor. */
export type SpawnExperienceOrbPayload = PayloadOf<typeof spawnExperienceOrbPacket>;
