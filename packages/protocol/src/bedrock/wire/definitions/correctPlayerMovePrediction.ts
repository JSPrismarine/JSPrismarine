/**
 * `CorrectPlayerMovePredictionPacket`: rewinds a client to a server-authoritative movement state.
 *
 * Layout: `PredictionType` (uint8), `Pos` and `Pos Delta` (three little-endian
 * floats each), `Rotation` (two little-endian floats), optional `Vehicle Angular Velocity`
 * (presence boolean and float), `On Ground` (boolean), and `Tick` (varuint64). Rotation and
 * the angular velocity presence byte are present for player corrections too.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/correct-player-move-prediction-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** What the movement correction rewinds, as the `PredictionType` byte numbers it. */
export enum RewindType {
    Player = 0,
    Vehicle = 1
}

/** The fields sent to correct one player's movement state and tick. */
export const correctPlayerMovePredictionPacket = definePacket('CorrectPlayerMovePredictionPacket', {
    /** `PredictionType`: whether the player or its vehicle is being corrected. */
    predictionType: t.enumOf<RewindType>(t.uint8),
    /** `Pos`: the position the client should have reached at the corrected tick. */
    pos: vec3Structure,
    /** `Pos Delta`: the velocity the client should have reached at the corrected tick. */
    posDelta: vec3Structure,
    /** `Rotation` X: the first rotation component; meaningful for a vehicle correction. */
    rotationX: t.lf32,
    /** `Rotation` Y: the second rotation component; meaningful for a vehicle correction. */
    rotationY: t.lf32,
    /** `Vehicle Angular Velocity`: the vehicle's angular velocity, `null` when absent. */
    vehicleAngularVelocity: t.optional(t.lf32),
    /** `On Ground`: whether the corrected state is on the ground. */
    onGround: t.bool,
    /** `Tick`: the input tick the client should rewind to, as a varuint64. */
    tick: t.varuint64
});

/** Payload carried by `CorrectPlayerMovePredictionPacket`. */
export type CorrectPlayerMovePredictionPayload = PayloadOf<typeof correctPlayerMovePredictionPacket>;
