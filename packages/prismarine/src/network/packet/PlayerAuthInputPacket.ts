import { Vector3 } from '@jsprismarine/math';
import { PlayerAuthInputData } from '@jsprismarine/minecraft';
import BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';
import type { ItemStackRequest } from '../type/ItemStackRequest';
import { readItemStackRequest } from '../type/ItemStackRequest';
import type { UseItemData } from './InventoryTransactionPacket';
import { InventoryAction, LegacySlotChange, readUseItemData, writeUseItemData } from './InventoryTransactionPacket';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * How many flags `PlayerAuthInputData` has room for: one past its highest member, 66.
 *
 * The enum's values are not consecutive. Members 2, 54 and 55 were removed from the game and
 * their numbers were never reused, so `JumpDown` is 3 and `InternalUpdate` is 65. The 1.26.51
 * docs page numbers the members 0 to 62 as if there were no gaps; the 1.26.60 docs corrected
 * it, and gophertunnel's `InputFlagCount` agrees with the corrected numbering.
 *
 * `Input Data` is a list of the set flags, so a count above this is not a client with more to
 * say. It is a packet that is not what it claims to be, and a reader that trusts it allocates
 * whatever the number asks for.
 */
export const INPUT_FLAG_COUNT =
    Math.max(...Object.values(PlayerAuthInputData).filter((value): value is number => typeof value === 'number')) + 1;

/** The most `Player Block Actions` entries the docs allow in one packet (`maxItems`). */
export const MAX_BLOCK_ACTIONS = 100;

/**
 * `InputMode`: the input device the player is using, as `Input Mode` numbers it.
 *
 * The 1.26.51 docs list four modes and `Count`, which the rendered page numbers 4; the
 * 1.26.60 docs corrected `Count` to 5. The datagen snapshot in `packages/minecraft` has the
 * member the docs' list drops, `MotionController_Deprecated = 4`, and that is why `Count` is
 * 5. It stays here under the snapshot's name because a client can still write 4, and the
 * handler's range check accepts every value below `Count`.
 */
export enum InputMode {
    Undefined = 0,
    Mouse = 1,
    Touch = 2,
    GamePad = 3,
    /** The motion controller the docs' member list leaves out. gophertunnel names it `InputModeMotionController`. */
    MotionController_Deprecated = 4,
    /** One past the last mode; not a mode a client can send. */
    Count = 5
}

/**
 * `ClientPlayMode`: whether the player is in the normal game or in one of the VR modes, as
 * `Play Mode` numbers it.
 *
 * The 1.26.51 docs page numbers the members 0 to 4; the 1.26.60 docs corrected `ExitLevel`
 * to 7 and `NumModes` to 9. Members 3 to 6 and 8 are the VR modes the docs no longer list
 * (viewer, reality, placement, living room, exit level living room in gophertunnel's naming).
 */
export enum ClientPlayMode {
    Normal = 0,
    Teaser = 1,
    Screen = 2,
    ExitLevel = 7,
    /** One past the last mode; not a mode a client can send. */
    NumModes = 9
}

/** `NewInteractionModel`: how the player targets blocks, as `New Interaction Model` numbers it. */
export enum NewInteractionModel {
    Touch = 0,
    Crosshair = 1,
    Classic = 2,
    /** One past the last model; not a model a client can send. */
    Count = 3
}

/** A `Vec2`, as the wire carries a rotation or a joystick: two little-endian floats. */
export interface Vec2 {
    x: number;
    y: number;
}

/**
 * One `PlayerBlockActionData`: a thing the player did to a block this tick.
 *
 * Every entry carries all three fields. The docs say a `StopDestroyBlock` "serializes the
 * default value" for its position rather than leaving it out.
 */
export interface PlayerBlockAction {
    /** `Player Action Type`, a `PlayerActionType` in the same numbering `PlayerActionPacket` uses. */
    action: number;
    /** `Position`, the block the action concerns, or the origin for a `StopDestroyBlock`. */
    position: BlockPosition;
    /** `Facing`: the block face, "or action-specific integer data for AbortDestroyBlock". */
    face: number;
}

/**
 * A `PackedItemUseLegacyInventoryTransaction`: an item used in the same tick the player moved,
 * carried inside the input.
 */
export interface AuthInputItemUse {
    legacyRequestId: number;
    legacySlotChanges: LegacySlotChange[];
    actions: InventoryAction[];
    data: UseItemData;
}

/**
 * Where the player is and what they pressed, every tick.
 *
 * The only movement packet a client sends. Client authoritative movement through
 * `MovePlayerPacket` was retired at 1.21.80, so a client of this version sends this twenty
 * times a second whether the server asked for it or not, and a server that does not read it
 * has players who never move.
 *
 * It is also where a survival break arrives: the start, the swings, the abort and the stop
 * all come in `Player Block Actions` rather than in `PlayerActionPacket`, which still carries
 * a creative break and the actions that have no block. When the client used an item or
 * rearranged its inventory in the same tick, that transaction or request comes inside this
 * packet, in the same shape it has in its own.
 *
 * Protocol 2193 wire order, with the docs' field names:
 *
 * 1. `Player Rotation` (`Vec2`: pitch, yaw), `Position` (`Vec3`), `Move Vector` (`Vec2`),
 *    `Player Head Rotation` (float).
 * 2. `Input Data`: a varuint32 count, then each set flag as a ZigZag varint32
 *    `PlayerAuthInputData` value. See {@link INPUT_FLAG_COUNT} for the numbering.
 * 3. `Input Mode` (varuint32 {@link InputMode}), `Play Mode` (varuint32 {@link ClientPlayMode}),
 *    `New Interaction Model` (ZigZag varint32 {@link NewInteractionModel}), `Interact Rotation`
 *    (`Vec2`), `Client Tick` (`PlayerInputTick`, varuint64), `Pos Delta` (`Vec3`).
 * 4. Five optionals, each a presence byte then the value when it is 1: `Item Use Transaction`
 *    (a `PackedItemUseLegacyInventoryTransaction`), `Item Stack Request`, `Player Block
 *    Actions` (varuint32 count, then each `PlayerBlockActionData` as ZigZag varint32 type,
 *    `BlockPos`, ZigZag varint32 facing), `Vehicle Rotation` (`Vec2`), `Client Predicted
 *    Vehicle` (`ActorUniqueID`, ZigZag varint64). Protocol 2168 wrote a second presence byte
 *    for each; 2193 took the redundant one out.
 * 5. `Analog Move Vector` (`Vec2`), `Camera Orientation` (`Vec3`), `Raw Move Vector` (`Vec2`).
 *
 * The docs say each optional is present only when the matching `Input Data` flag is set
 * (`PerformItemInteraction`, `PerformItemStackRequest`, `PerformBlockActions`,
 * `IsInClientPredictedVehicle` for the last two). The reader follows the presence byte, which
 * is what is on the wire; `PlayerAuthInputHandler` checks the flags.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-auth-input-packet/
 */
export default class PlayerAuthInputPacket extends FieldNetworkPacket {
    /** `Player Rotation` X: the pitch at the start of the tick. */
    public pitch = 0;
    /** `Player Rotation` Y: the yaw at the start of the tick. */
    public yaw = 0;
    /** `Position`: the client's predicted position at the end of the tick. */
    public position: Vector3 = Vector3.ZERO;
    /** `Move Vector`: the desired direction of travel, in the player's own frame. */
    public moveVector: Vec2 = { x: 0, y: 0 };
    /** `Player Head Rotation`. */
    public headYaw = 0;
    /** `Input Data`: which `PlayerAuthInputData` flags are set this tick. */
    public inputData: Set<PlayerAuthInputData> = new Set();
    /** `Input Mode`, an {@link InputMode}. */
    public inputMode = 0;
    /** `Play Mode`, a {@link ClientPlayMode}. */
    public playMode = 0;
    /** `New Interaction Model`, a {@link NewInteractionModel}. */
    public interactionModel = 0;
    /** `Interact Rotation`: where the player is looking for the purpose of interacting, as pitch and yaw. */
    public interactRotation: Vec2 = { x: 0, y: 0 };
    /** `Client Tick`: the client's simulation frame. */
    public tick = 0n;
    /** `Pos Delta`: the client's predicted velocity at the end of the tick. */
    public delta: Vector3 = Vector3.ZERO;
    /** `Item Use Transaction`, or null when the presence byte was 0. */
    public itemUseTransaction: AuthInputItemUse | null = null;
    /** `Item Stack Request`, or null when the presence byte was 0. */
    public itemStackRequest: ItemStackRequest | null = null;
    /** `Player Block Actions`, or null when the presence byte was 0. */
    public blockActions: PlayerBlockAction[] | null = null;
    /** `Vehicle Rotation`, or null when the presence byte was 0. */
    public vehicleRotation: Vec2 | null = null;
    /** `Client Predicted Vehicle`, or null when the presence byte was 0. */
    public predictedVehicle: bigint | null = null;
    /** `Analog Move Vector`. */
    public analogMoveVector: Vec2 = { x: 0, y: 0 };
    /** `Camera Orientation`: the world space direction the camera is pointing. */
    public cameraOrientation: Vector3 = Vector3.ZERO;
    /** `Raw Move Vector`: the move vector before input permissions were applied to it. */
    public rawMoveVector: Vec2 = { x: 0, y: 0 };

    /**
     * Reads the layout described on the class.
     *
     * Values are stored as read; the handler decides whether they are ones a client can send.
     * The two counts are the exception, because a count decides how much is read next.
     * @throws {Error} When `Input Data` claims more flags than exist or `Player Block Actions`
     * more entries than the docs allow.
     */
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
        this.blockActions = this.readBoolean() ? this.readBlockActions() : null;
        this.vehicleRotation = this.readBoolean() ? this.readVec2() : null;
        this.predictedVehicle = this.readBoolean() ? this.readVarLong() : null;

        this.analogMoveVector = this.readVec2();
        this.cameraOrientation = NetworkUtil.readVector3(this);
        this.rawMoveVector = this.readVec2();
    }

    /**
     * The mirror of {@link decodePayload}, so that a client such as the bot harness can send
     * what a real one sends, and so that a test can pin the two against each other.
     * @throws {Error} When an `Item Stack Request` is set: the server only ever reads one, and
     * there is no writer for it.
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
     * `Player Block Actions`: a varuint32 count, then each entry with all three fields.
     *
     * The count is checked against {@link MAX_BLOCK_ACTIONS} before anything is allocated.
     */
    private readBlockActions(): PlayerBlockAction[] {
        const count = this.readUnsignedVarInt();
        if (count > MAX_BLOCK_ACTIONS) {
            throw new Error(`PlayerAuthInput claims ${count} block actions; the docs allow ${MAX_BLOCK_ACTIONS}`);
        }

        return Array.from({ length: count }, () => ({
            action: this.readVarInt(),
            position: BlockPosition.fromVector3(NetworkUtil.readBlockPosition(this)),
            face: this.readVarInt()
        }));
    }

    /**
     * A `PackedItemUseLegacyInventoryTransaction`.
     *
     * The same transaction `InventoryTransactionPacket` carries under type `USE_ITEM`, minus
     * the type: `Legacy Request ID` (ZigZag varint32), `Legacy Set Item Slots` behind a
     * presence byte, the `Actions`, then the `ItemUseInventoryTransaction` itself.
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
