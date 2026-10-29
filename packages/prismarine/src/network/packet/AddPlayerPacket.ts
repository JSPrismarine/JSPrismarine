import { BuildPlatform, CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { Metadata } from '../../entity/Metadata';
import { Item } from '../../item/Item';
import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
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

    public metadata: Metadata = new Metadata();

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

    /**
     * Reads the 2193 layout back, the mirror of {@link encodePayload}.
     *
     * The structures the encoder writes empty are read in full rather than kept: the Synched
     * Properties lists, the Abilities Data layers and the Actor Links have nowhere to live on
     * this class, but each still has to come off the stream for the fields behind it to be
     * read from the right place.
     */
    public decodePayload(): void {
        this.uuid = UUID.networkDeserialize(this);
        this.name = NetworkUtil.readString(this);
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.platformChatId = NetworkUtil.readString(this);

        this.positionX = this.readFloatLE();
        this.positionY = this.readFloatLE();
        this.positionZ = this.readFloatLE();

        this.motionX = this.readFloatLE();
        this.motionY = this.readFloatLE();
        this.motionZ = this.readFloatLE();

        this.pitch = this.readFloatLE();
        this.yaw = this.readFloatLE();
        this.headYaw = this.readFloatLE();

        this.item = Item.networkDeserialize(this);

        this.gamemode = this.readVarInt();

        this.metadata = new Metadata(false);
        this.metadata.networkDeserialize(this);

        // Synched Properties, written empty by the encoder.
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            this.readUnsignedVarInt(); // Property Index.
            this.readVarInt(); // Data.
        }
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            this.readUnsignedVarInt(); // Property Index.
            this.readFloatLE(); // Data.
        }

        // Abilities Data. The layers travel in `UpdateAbilitiesPacket`; see `AbilityLayer`
        // there for the six fields read past per layer.
        this.uniqueEntityId = this.readLongLE();
        this.playerPermission = this.readSignedByte();
        this.commandPermission = this.readByte();
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            this.readUnsignedShortLE(); // SerializedLayer.
            this.readUnsignedIntLE(); // AbilitiesSet.
            this.readUnsignedIntLE(); // AbilityValues.
            this.readFloatLE(); // FlySpeed.
            this.readFloatLE(); // VerticalFlySpeed.
            this.readFloatLE(); // WalkSpeed.
        }

        // Actor Links, in the six-field 2193 `ActorLink` layout.
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            this.readVarLong(); // Target A.
            this.readVarLong(); // Target B.
            this.readByte(); // Type.
            this.readBoolean(); // Immediate.
            this.readBoolean(); // Passenger Initiated.
            this.readFloatLE(); // Vehicle Angular Velocity.
        }

        this.deviceId = NetworkUtil.readString(this);
        this.buildPlatform = this.readIntLE();
    }
}
