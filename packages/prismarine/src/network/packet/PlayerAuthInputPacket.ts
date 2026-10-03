import { Vector3 } from '@jsprismarine/math';
import type { PlayerAuthInputData } from '@jsprismarine/minecraft';
import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import type { ItemStackRequest } from '../type/ItemStackRequest';
import { readItemStackRequest } from '../type/ItemStackRequest';
import type { UseItemData } from './InventoryTransactionPacket';
import { InventoryAction, LegacySlotChange, readUseItemData, writeUseItemData } from './InventoryTransactionPacket';
import DataPacket from './DataPacket';

/**
 * How many flags {@link PlayerAuthInputData} has room for.
 *
 * A count above this is not a client with more to say, it is a packet that is not what it
 * claims to be - and a reader that trusts it allocates whatever the number asks for.
 */
const INPUT_FLAG_COUNT = 66;

/** A vector with two components, as the wire carries a rotation or a joystick. */
export interface Vec2 {
    x: number;
    y: number;
}

/** One thing the player did to a block this tick: started breaking it, gave up, punched it again. */
export interface PlayerBlockAction {
    /** A `PlayerAction`, the same numbering `PlayerActionPacket` uses. */
    action: number;
    position: BlockPosition;
    face: number;
}

/** An item used on a block in the same tick the player moved, carried inside the input. */
export interface AuthInputItemUse {
    legacyRequestId: number;
    legacySlotChanges: LegacySlotChange[];
    actions: InventoryAction[];
    data: UseItemData;
}

/**
 * Where the player is and what they pressed, every tick.
 *
 * The only movement packet a client sends. Client authoritative movement - `MovePlayerPacket`
 * from the client - was retired at 1.21.80 and its selector left `StartGamePacket` at
 * 1.21.90, so a client of this version sends this twenty times a second whether the server
 * asked for it or not, and a server that does not read it has players who never move.
 *
 * It is also where a survival break arrives now: the start, the swings, the abort and the
 * stop all ride in `blockActions` rather than in `PlayerActionPacket`, which still carries a
 * creative break and the actions that have no block. And when the client used an item or
 * rearranged its inventory in the same tick, that transaction or request comes inside this
 * packet, in the same shape it has in its own.
 *
 * The layout is protocol 2193's, from Mojang's schema and gophertunnel's
 * `packet/player_auth_input.go`. Five optionals each open with a presence byte; 2168 wrote
 * that byte twice for each, and 2193 took the redundant one back out.
 *
 * **Bound To:** Server
 */
export default class PlayerAuthInputPacket extends DataPacket {
    public static NetID = Identifiers.PlayerAuthInputPacket;

    public pitch = 0;
    public yaw = 0;
    /** The client's predicted position at the end of the tick. */
    public position: Vector3 = Vector3.ZERO;
    /** The desired direction of travel, in the player's own frame. */
    public moveVector: Vec2 = { x: 0, y: 0 };
    public headYaw = 0;
    /** Which {@link PlayerAuthInputData} flags are set this tick. */
    public inputData: Set<PlayerAuthInputData> = new Set();
    public inputMode = 0;
    public playMode = 0;
    public interactionModel = 0;
    /** Where the player is looking for the purpose of interacting, as pitch and yaw. */
    public interactRotation: Vec2 = { x: 0, y: 0 };
    /** The client's simulation frame. */
    public tick = 0n;
    /** The client's predicted velocity at the end of the tick. */
    public delta: Vector3 = Vector3.ZERO;
    public itemUseTransaction: AuthInputItemUse | null = null;
    public itemStackRequest: ItemStackRequest | null = null;
    public blockActions: PlayerBlockAction[] | null = null;
    public vehicleRotation: Vec2 | null = null;
    public predictedVehicle: bigint | null = null;
    public analogMoveVector: Vec2 = { x: 0, y: 0 };
    /** The world space direction the camera is pointing. */
    public cameraOrientation: Vector3 = Vector3.ZERO;
    /** The move vector before input permissions were applied to it. */
    public rawMoveVector: Vec2 = { x: 0, y: 0 };

    public decodePayload(): void {
        this.pitch = this.readFloatLE();
        this.yaw = this.readFloatLE();
        this.position = NetworkUtil.readVector3(this);
        this.moveVector = this.readVec2();
        this.headYaw = this.readFloatLE();

        const flags = this.readUnsignedVarInt();
        if (flags > INPUT_FLAG_COUNT) {
            throw new Error(`PlayerAuthInput claims ${flags} input flags; there are ${INPUT_FLAG_COUNT}`);
        }
        this.inputData = new Set();
        for (let i = 0; i < flags; i++) this.inputData.add(this.readVarInt());

        this.inputMode = this.readUnsignedVarInt();
        this.playMode = this.readUnsignedVarInt();
        this.interactionModel = this.readVarInt();
        this.interactRotation = this.readVec2();
        this.tick = this.readUnsignedVarLong();
        this.delta = NetworkUtil.readVector3(this);

        this.itemUseTransaction = this.readBoolean() ? this.readItemUse() : null;
        this.itemStackRequest = this.readBoolean() ? readItemStackRequest(this) : null;
        this.blockActions = this.readBoolean()
            ? Array.from({ length: this.readUnsignedVarInt() }, () => ({
                  action: this.readVarInt(),
                  position: BlockPosition.fromVector3(NetworkUtil.readBlockPosition(this)),
                  face: this.readVarInt()
              }))
            : null;
        this.vehicleRotation = this.readBoolean() ? this.readVec2() : null;
        this.predictedVehicle = this.readBoolean() ? this.readVarLong() : null;

        this.analogMoveVector = this.readVec2();
        this.cameraOrientation = NetworkUtil.readVector3(this);
        this.rawMoveVector = this.readVec2();
    }

    /**
     * The mirror of {@link decodePayload}, so that a client - the bot harness - can send what
     * a real one sends, and so that a test can pin the two against each other.
     */
    public encodePayload(): void {
        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        NetworkUtil.writeVector3(this, this.position);
        this.writeVec2(this.moveVector);
        this.writeFloatLE(this.headYaw);

        this.writeUnsignedVarInt(this.inputData.size);
        for (const flag of this.inputData) this.writeVarInt(flag);

        this.writeUnsignedVarInt(this.inputMode);
        this.writeUnsignedVarInt(this.playMode);
        this.writeVarInt(this.interactionModel);
        this.writeVec2(this.interactRotation);
        this.writeUnsignedVarLong(this.tick);
        NetworkUtil.writeVector3(this, this.delta);

        this.writeBoolean(this.itemUseTransaction !== null);
        if (this.itemUseTransaction !== null) this.writeItemUse(this.itemUseTransaction);

        // A request cannot be written: the server only ever reads one. The bot does not
        // craft, and a test that needs one builds the bytes itself.
        if (this.itemStackRequest !== null)
            throw new Error('PlayerAuthInputPacket cannot encode an item stack request');
        this.writeBoolean(false);

        this.writeBoolean(this.blockActions !== null);
        if (this.blockActions !== null) {
            this.writeUnsignedVarInt(this.blockActions.length);
            for (const action of this.blockActions) {
                this.writeVarInt(action.action);
                NetworkUtil.writeBlockPosition(this, action.position);
                this.writeVarInt(action.face);
            }
        }

        this.writeBoolean(this.vehicleRotation !== null);
        if (this.vehicleRotation !== null) this.writeVec2(this.vehicleRotation);
        this.writeBoolean(this.predictedVehicle !== null);
        if (this.predictedVehicle !== null) this.writeVarLong(this.predictedVehicle);

        this.writeVec2(this.analogMoveVector);
        NetworkUtil.writeVector3(this, this.cameraOrientation);
        this.writeVec2(this.rawMoveVector);
    }

    /**
     * The item use a tick can carry - `PackedItemUseLegacyInventoryTransaction`.
     *
     * The same transaction `InventoryTransactionPacket` carries under type `USE_ITEM`, minus
     * the type: a request id, the legacy slot changes as an optional, the actions, then the
     * use itself.
     */
    private readItemUse(): AuthInputItemUse {
        const legacyRequestId = this.readVarInt();
        const legacySlotChanges = this.readBoolean()
            ? Array.from({ length: this.readUnsignedVarInt() }, () => LegacySlotChange.fromNetwork(this))
            : [];
        const actions = Array.from({ length: this.readUnsignedVarInt() }, () => InventoryAction.fromNetwork(this));

        return { legacyRequestId, legacySlotChanges, actions, data: readUseItemData(this) };
    }

    private writeItemUse(use: AuthInputItemUse): void {
        this.writeVarInt(use.legacyRequestId);
        this.writeBoolean(use.legacySlotChanges.length > 0);
        if (use.legacySlotChanges.length > 0) {
            this.writeUnsignedVarInt(use.legacySlotChanges.length);
            for (const change of use.legacySlotChanges) change.toNetwork(this);
        }
        this.writeUnsignedVarInt(use.actions.length);
        for (const action of use.actions) action.toNetwork(this);
        writeUseItemData(this, use.data);
    }

    private readVec2(): Vec2 {
        return { x: this.readFloatLE(), y: this.readFloatLE() };
    }

    private writeVec2(vector: Vec2): void {
        this.writeFloatLE(vector.x);
        this.writeFloatLE(vector.y);
    }
}
