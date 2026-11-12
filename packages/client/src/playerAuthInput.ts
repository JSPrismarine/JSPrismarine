import { Vector3 } from '@jsprismarine/math';
import {
    ClientPlayMode,
    InputMode,
    NewInteractionModel,
    PlayerAuthInputData,
    PlayerAuthInputPacket
} from '@jsprismarine/protocol';

/**
 * The vertical velocity a client standing on the ground predicts every tick: one tick of
 * gravity (0.08) after drag (0.98), which the ground then cancels.
 */
const STANDING_DELTA_Y = -0.08 * 0.98;

const DEGREES = Math.PI / 180;

/** How far along an axis of `Move Vector` the walk has to point for its key to count as held. */
const KEY_DEAD_ZONE = 0.3;

/** How far the player walked this tick, in blocks along x and z. */
export interface Walk {
    readonly x: number;
    readonly z: number;
}

/** Where a client's player is and which way it faces, in degrees, as its input reports it. */
export interface InputPose {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
}

/** What one tick's input carries beside the pose. */
export interface InputTick {
    /** The client's own frame counter, one a tick, which the server echoes back. */
    readonly tick: bigint;
    /** How far the player walked this tick, when it walked. */
    readonly walk?: Walk;
    /** Whether this is the first input since the client applied a teleport the server sent. */
    readonly handledTeleport?: boolean;
}

/**
 * The `PlayerAuthInputPacket` a desktop client standing on the ground sends for one tick.
 *
 * The one packet a client of a supported protocol moves with: `MovePlayerPacket` is client-bound
 * only since protocol 818, and the server drops one a client sends.
 *
 * `Move Vector` is in the player's own frame, x to the left and y forward, so a walk is turned
 * by the yaw the input reports: a bot that looked away after walking reports a sideways step.
 * The delta is the walk plus the standing fall the ground cancels, and `VerticalCollision` is
 * that ground, which the server reads as standing on it.
 * @param pose - Where the player is at the end of the tick.
 * @param input - The tick, and what else happened in it.
 * @returns The packet, ready to send.
 */
export const playerAuthInput = (pose: InputPose, { tick, walk, handledTeleport = false }: InputTick) => {
    const yaw = pose.yaw * DEGREES;
    const pitch = pose.pitch * DEGREES;
    const step = walk === undefined ? 0 : Math.hypot(walk.x, walk.z);
    const moveVector =
        walk === undefined || step === 0
            ? { x: 0, y: 0 }
            : {
                  x: (walk.x * Math.cos(yaw) + walk.z * Math.sin(yaw)) / step,
                  y: (walk.z * Math.cos(yaw) - walk.x * Math.sin(yaw)) / step
              };

    // A key is held when its axis is past the dead zone, so rounding in a straight walk does
    // not press a side key too.
    const inputData = new Set<number>([PlayerAuthInputData.VERTICAL_COLLISION]);
    if (moveVector.y > KEY_DEAD_ZONE) inputData.add(PlayerAuthInputData.UP);
    if (moveVector.y < -KEY_DEAD_ZONE) inputData.add(PlayerAuthInputData.DOWN);
    if (moveVector.x > KEY_DEAD_ZONE) inputData.add(PlayerAuthInputData.LEFT);
    if (moveVector.x < -KEY_DEAD_ZONE) inputData.add(PlayerAuthInputData.RIGHT);
    if (handledTeleport) inputData.add(PlayerAuthInputData.HANDLED_TELEPORT);

    return new PlayerAuthInputPacket({
        pitch: pose.pitch,
        yaw: pose.yaw,
        position: new Vector3(pose.position.x, pose.position.y, pose.position.z),
        moveVector,
        headYaw: pose.headYaw,
        inputData,
        inputMode: InputMode.Mouse,
        playMode: ClientPlayMode.Normal,
        interactionModel: NewInteractionModel.Crosshair,
        interactRotation: { x: pose.pitch, y: pose.yaw },
        tick,
        delta: new Vector3(walk?.x ?? 0, STANDING_DELTA_Y, walk?.z ?? 0),
        itemUseTransaction: null,
        itemStackRequest: null,
        blockActions: null,
        vehicleRotation: null,
        predictedVehicle: null,
        analogMoveVector: moveVector,
        cameraOrientation: new Vector3(
            -Math.sin(yaw) * Math.cos(pitch),
            -Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch)
        ),
        rawMoveVector: moveVector
    });
};
