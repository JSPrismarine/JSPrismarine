import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import MovementType from '../type/MovementType';
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
 *
 * `MovementType` names Respawn and OnlyHeadRot `Reset` and `Pitch`.
 */
export default class MovePlayerPacket extends DataPacket {
    public static NetID = Identifiers.MovePlayerPacket;

    public runtimeEntityId!: bigint;

    public position!: Vector3;

    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public mode!: number;

    public onGround!: boolean;

    public ridingEntityRuntimeId!: bigint;

    /** The docs' Teleportation Cause. Set only when `mode` is `MovementType.Teleport`. */
    public teleportCause!: number;
    /**
     * The docs' Source Actor Type: the actor type that caused the teleport. The name is
     * historical. Set only when `mode` is `MovementType.Teleport`.
     */
    public teleportItemId!: number;

    public tick!: bigint;

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.position = NetworkUtil.readVector3(this);
        this.pitch = this.readFloatLE();
        this.yaw = this.readFloatLE();
        this.headYaw = this.readFloatLE();

        this.mode = this.readByte();
        this.onGround = this.readBoolean();
        this.ridingEntityRuntimeId = this.readUnsignedVarLong();

        // Teleport Data is an optional with a presence byte of its own. The byte is always on
        // the wire, so a reader that skips it takes it for the first byte of the tick.
        if (this.readBoolean()) {
            this.teleportCause = this.readIntLE();
            this.teleportItemId = this.readIntLE();
        }

        this.tick = this.readUnsignedVarLong();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        NetworkUtil.writeVector3(this, this.position);
        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);

        this.writeByte(this.mode);
        this.writeBoolean(this.onGround);
        this.writeUnsignedVarLong(this.ridingEntityRuntimeId);

        const teleporting = this.mode === MovementType.Teleport;
        this.writeBoolean(teleporting);
        if (teleporting) {
            this.writeIntLE(this.teleportCause);
            this.writeIntLE(this.teleportItemId);
        }

        this.writeUnsignedVarLong(this.tick);
    }
}
