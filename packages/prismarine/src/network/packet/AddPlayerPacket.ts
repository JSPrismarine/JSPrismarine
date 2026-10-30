import { BuildPlatform, CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt } from '@jsprismarine/protocol';
import { Metadata } from '../../entity/Metadata';
import { Item } from '../../item/Item';
import type UUID from '../../utils/UUID';
import { SyncedProperties } from '../type/SyncedProperties';
import type { PassengerOfBlock } from '../type/PassengerOfBlock';
import DataPacket from './DataPacket';
import { addPlayerPacket } from '@jsprismarine/protocol/wire/definitions/addPlayer';

import type { ActorLink } from './AddActorPacket';
import type { SerializedAbilitiesData } from '@jsprismarine/protocol/wire/definitions/addPlayer';
import type { ItemStackDescriptorData } from '@jsprismarine/protocol/wire/structures/ItemStackDescriptor';

/**
 * Spawns another player's entity on a client.
 *
 * **Bound To:** Client
 *
 * The wire layout lives in `addPlayer.wire.ts`'s declarative definition, which this class
 * walks at the protocol version stamped on it: the sixteen documented 2193 fields, plus the
 * optional `Passenger Block Data` inserted before the device id from 2225 on. One class
 * serves every version; which fields travel is the layout's decision, not this file's.
 */
export default class AddPlayerPacket extends DataPacket {
    public uuid!: UUID;
    public name!: string;
    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public platformChatId = '';

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

    /** Synched Properties. Neither list is populated here, so both counts go out as zero. */
    public syncedProperties = new SyncedProperties();

    /** Actor Links. The server does not track riding, so there is nothing to list. */
    public links: ActorLink[] = [];

    /** Passenger Block Data, from 2225 on: the ridden block, or `null` for not riding. */
    public passengerOfBlock: PassengerOfBlock | null = null;

    /** The Position triple under the one key the layout carries it as. */
    public get position(): Vector3 {
        return new Vector3(this.positionX, this.positionY, this.positionZ);
    }

    public set position(value: Vector3) {
        this.positionX = value.getX();
        this.positionY = value.getY();
        this.positionZ = value.getZ();
    }

    /** The Velocity triple under the one key the layout carries it as. */
    public get motion(): Vector3 {
        return new Vector3(this.motionX, this.motionY, this.motionZ);
    }

    public set motion(value: Vector3) {
        this.motionX = value.getX();
        this.motionY = value.getY();
        this.motionZ = value.getZ();
    }

    /**
     * The held stack as the layout carries it: a `NetworkItemStackDescriptor`, which the
     * protocol package writes and this class converts the server's `Item` into. Air is a full
     * empty stack at this version, not a bare zero - a single byte here left the client
     * reading the gamemode out of the middle of it, and everything after that one field out.
     */
    public get carriedItem(): ItemStackDescriptorData {
        return (this.item ?? Item.air()).toStackDescriptor(this);
    }

    public set carriedItem(value: ItemStackDescriptorData) {
        this.item = Item.fromStackDescriptor(this, value);
    }

    /**
     * Abilities Data. The layers travel in `UpdateAbilitiesPacket`, so the list goes out
     * empty here, and the server numbers a player once, so the runtime id doubles as the
     * target raw id when no unique id was set.
     */
    public get abilities(): SerializedAbilitiesData {
        return {
            targetPlayerRawId: this.uniqueEntityId || this.runtimeEntityId,
            playerPermission: this.playerPermission,
            commandPermission: this.commandPermission,
            layers: []
        };
    }

    public set abilities(value: SerializedAbilitiesData) {
        this.uniqueEntityId = value.targetPlayerRawId;
        this.playerPermission = value.playerPermission;
        this.commandPermission = value.commandPermission;
        // The layers are read past rather than kept; this class has nowhere to apply them.
    }

    /** Writes the fields the stamped protocol version puts on the wire, in layout order. */
    public encodePayload(): void {
        layoutAt(addPlayerPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order, filling version-absent fields with their fallbacks. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(addPlayerPacket, this.codecProtocol).decode(this));
    }
}
