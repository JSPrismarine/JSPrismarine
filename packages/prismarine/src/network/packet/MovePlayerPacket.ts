import { layoutAt, movePlayerPacket } from '@jsprismarine/protocol';

import type { Vector3 } from '@jsprismarine/math';
import PositionMode from '../type/PositionMode';
import DataPacket from './DataPacket';

/**
 * Where a player is, as the server tells a client, or as the bot harness tells the server.
 *
 * Protocol 2193 wire order, with the field names Mojang's docs use: Player Runtime ID
 * (varuint64), Position (three LE floats), Rotation (pitch then yaw, LE floats), Y-Head
 * Rotation (LE float), Position Mode (uint8: 0 Normal, 1 Respawn, 2 Teleport, 3 OnlyHeadRot),
 * On Ground (bool), Riding Runtime ID (varuint64), Teleport Data (optional), Tick (varuint64).
 *
 * Teleport Data is an optional with a presence byte of its own, which the client only sets
 * when Position Mode is Teleport. When present it is Teleportation Cause and Source Actor
 * Type, both int32 LE. A reader that skips the presence byte takes it for the first byte of
 * the tick.
 */
export default class MovePlayerPacket extends DataPacket {
    public runtimeEntityId!: bigint;

    public position!: Vector3;

    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public mode!: number;

    public onGround!: boolean;

    public ridingEntityRuntimeId!: bigint;

    /** The docs' Teleportation Cause. Set only when `mode` is `PositionMode.Teleport`. */
    public teleportCause!: number;
    /**
     * The docs' Source Actor Type: the actor type that caused the teleport. The name is
     * historical. Set only when `mode` is `PositionMode.Teleport`.
     */
    public teleportItemId!: number;

    public tick!: bigint;

    public decodePayload(): void {
        const read = layoutAt(movePlayerPacket, this.codecProtocol).decode(this);
        this.runtimeEntityId = read.runtimeEntityId;
        this.position = read.position;
        this.pitch = read.pitch;
        this.yaw = read.yaw;
        this.headYaw = read.headYaw;
        this.mode = read.mode;
        this.onGround = read.onGround;
        this.ridingEntityRuntimeId = read.ridingEntityRuntimeId;
        if (read.teleportData !== null) {
            this.teleportCause = read.teleportData.cause;
            this.teleportItemId = read.teleportData.sourceActorType;
        }

        this.tick = read.tick;
    }

    public encodePayload(): void {
        layoutAt(movePlayerPacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId,
            position: this.position,
            pitch: this.pitch,
            yaw: this.yaw,
            headYaw: this.headYaw,
            mode: this.mode,
            onGround: this.onGround,
            ridingEntityRuntimeId: this.ridingEntityRuntimeId,
            // Only a teleport carries the cause, so the presence byte follows the mode rather
            // than whether the fields happen to be set.
            teleportData:
                this.mode === PositionMode.Teleport
                    ? { cause: this.teleportCause, sourceActorType: this.teleportItemId }
                    : null,
            tick: this.tick
        });
    }
}
