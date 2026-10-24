import { BuildPlatform, CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { Metadata } from '../../entity/Metadata';
import { Item } from '../../item/Item';
import { NetworkUtil } from '../../network/NetworkUtil';
import type UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Spawns another player's entity on a client.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193, in order and with the names the docs use:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | UUID | mce::UUID | Most significant uint64 LE, then least significant uint64 LE |
 * | Player Name | String | |
 * | Target Runtime ID | UnsignedVarLong | |
 * | Platform Chat Id | String | |
 * | Position | Vec3 (LFloat) | |
 * | Velocity | Vec3 (LFloat) | |
 * | Rotation | Vec2 (LFloat) | Pitch, then yaw |
 * | Y-Head Rotation | LFloat | |
 * | Carried Item | NetworkItemStackDescriptor | See {@link Item.networkSerialize} |
 * | Player Game Type | VarInt | A `Gametype` value |
 * | Entity Data | SynchedActorDataList | See {@link Metadata.networkSerialize} |
 * | Synched Properties | PropertySyncData | Int entry count, then float entry count; both always zero |
 * | Abilities Data | SerializedAbilitiesData | Target Player Raw Id LLong, Player Permissions Byte, Command Permissions Byte, layer count UnsignedVarInt |
 * | Actor Links | ActorLink[] | UnsignedVarInt count; always empty here |
 * | Device Id | String | |
 * | Build Platform | LInt | A `BuildPlatform` value |
 */
export default class AddPlayerPacket extends DataPacket {
    public static NetID = Identifiers.AddPlayerPacket;

    public uuid!: UUID;
    public name!: string;
    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public platformChatId!: string;

    public positionX: number = 0;
    public positionY: number = 5;
    public positionZ: number = 0;

    public motionX: number = 0;
    public motionY: number = 0;
    public motionZ: number = 0;

    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public gamemode: Gametype = Gametype.SURVIVAL;
    public item!: Item;

    /** The Player Permissions byte inside Abilities Data. */
    public playerPermission: PlayerPermissionLevel = PlayerPermissionLevel.VISITOR;

    /** The Command Permissions byte inside Abilities Data. */
    public commandPermission: CommandPermissionLevel = CommandPermissionLevel.ANY;

    public deviceId!: string;
    public buildPlatform: BuildPlatform = BuildPlatform.UNKNOWN;

    public metadata!: Metadata;

    constructor() {
        super();
        this.metadata = new Metadata();
    }

    public encodePayload(): void {
        this.uuid.networkSerialize(this);
        NetworkUtil.writeString(this, this.name);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        NetworkUtil.writeString(this, this.platformChatId || '');

        this.writeFloatLE(this.positionX);
        this.writeFloatLE(this.positionY);
        this.writeFloatLE(this.positionZ);

        this.writeFloatLE(this.motionX);
        this.writeFloatLE(this.motionY);
        this.writeFloatLE(this.motionZ);

        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);

        // The held stack, in the tracked form. Air is a full empty stack at this version, not
        // a bare zero - a single byte here left the client reading the gamemode out of the
        // middle of it, and everything after that was one field out.
        (this.item ?? Item.air()).networkSerialize(this);

        this.writeVarInt(this.gamemode);
        this.metadata.networkSerialize(this);

        // Synched Properties. Neither list is populated, so both counts are zero.
        this.writeUnsignedVarInt(0); // Int Entries List
        this.writeUnsignedVarInt(0); // Float Entries List

        // Abilities Data. The layers travel in `UpdateAbilitiesPacket`, so the list is empty here.
        this.writeLongLE(this.uniqueEntityId || this.runtimeEntityId); // Target Player Raw Id
        this.writeSignedByte(this.playerPermission); // Player Permissions
        this.writeByte(this.commandPermission); // Command Permissions
        this.writeUnsignedVarInt(0); // Layers

        // Actor Links. The server does not track riding, so there is nothing to list.
        this.writeUnsignedVarInt(0);

        NetworkUtil.writeString(this, this.deviceId);
        this.writeIntLE(this.buildPlatform);
    }
}
