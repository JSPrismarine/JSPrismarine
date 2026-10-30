/**
 * The `PlayerAuthInput` payload and its nested structures.
 *
 * The packet carries the player's predicted position and input flags every tick, followed by
 * optional block actions, item use, an item stack request, and vehicle data. All coordinates
 * and item stacks remain in Protocol's wire structures; a server resolves them into its own
 * game objects at the packet boundary.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-auth-input-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-auth-input-packet/
 */
import type { Vector3 } from '@jsprismarine/math';

import type BinaryStream from '@jsprismarine/binaryutils';
import BlockPos from '../../structure/BlockPos';
import { NetworkUtil } from '../networkUtil';
import {
    hasLegacyRequest,
    LegacySlotChange,
    MAX_INVENTORY_ACTIONS,
    readInventoryAction,
    readUseItemData,
    writeInventoryAction,
    writeUseItemData
} from './InventoryTransaction';
import { readItemStackRequest, writeItemStackRequest } from './ItemStackRequest';

import type { ItemStackRequest } from './ItemStackRequest';
import type { InventoryActionData, LegacyTransactionRequest, UseItemData } from './InventoryTransaction';

/** Input flags listed by Mojang for `PlayerAuthInputPacket`. */
export enum PlayerAuthInputData {
    ASCEND = 0,
    DESCEND = 1,
    JUMP_DOWN = 3,
    SPRINT_DOWN = 4,
    CHANGE_HEIGHT = 5,
    JUMPING = 6,
    AUTO_JUMPING_IN_WATER = 7,
    SNEAKING = 8,
    SNEAK_DOWN = 9,
    UP = 10,
    DOWN = 11,
    LEFT = 12,
    RIGHT = 13,
    UP_LEFT = 14,
    UP_RIGHT = 15,
    WANT_UP = 16,
    WANT_DOWN = 17,
    WANT_DOWN_SLOW = 18,
    WANT_UP_SLOW = 19,
    SPRINTING = 20,
    ASCEND_BLOCK = 21,
    DESCEND_BLOCK = 22,
    SNEAK_TOGGLE_DOWN = 23,
    PERSIST_SNEAK = 24,
    START_SPRINTING = 25,
    STOP_SPRINTING = 26,
    START_SNEAKING = 27,
    STOP_SNEAKING = 28,
    START_SWIMMING = 29,
    STOP_SWIMMING = 30,
    START_JUMPING = 31,
    START_GLIDING = 32,
    STOP_GLIDING = 33,
    PERFORM_ITEM_INTERACTION = 34,
    PERFORM_BLOCK_ACTIONS = 35,
    PERFORM_ITEM_STACK_REQUEST = 36,
    HANDLED_TELEPORT = 37,
    EMOTING = 38,
    MISSED_SWING = 39,
    START_CRAWLING = 40,
    STOP_CRAWLING = 41,
    START_FLYING = 42,
    STOP_FLYING = 43,
    CLIENT_ACK_SERVER_DATA = 44,
    IS_IN_CLIENT_PREDICTED_VEHICLE = 45,
    PADDLING_LEFT = 46,
    PADDLING_RIGHT = 47,
    BLOCK_BREAKING_DELAY_ENABLED = 48,
    HORIZONTAL_COLLISION = 49,
    VERTICAL_COLLISION = 50,
    DOWN_LEFT = 51,
    DOWN_RIGHT = 52,
    START_USING_ITEM = 53,
    START_SPIN_ATTACK = 56,
    STOP_SPIN_ATTACK = 57,
    IS_HOTBAR_ONLY_TOUCH = 58,
    JUMP_RELEASED_RAW = 59,
    JUMP_PRESSED_RAW = 60,
    JUMP_CURRENT_RAW = 61,
    SNEAK_RELEASED_RAW = 62,
    SNEAK_PRESSED_RAW = 63,
    SNEAK_CURRENT_RAW = 64,
    INTERNAL_UPDATE = 65
}

/** One past the largest flag number in the documented enum. */
export const INPUT_FLAG_COUNT =
    Math.max(...Object.values(PlayerAuthInputData).filter((value): value is number => typeof value === 'number')) + 1;

/** Maximum number of `PlayerBlockActionData` entries allowed in one packet. */
export const MAX_BLOCK_ACTIONS = 100;

/** The input device, as the packet's `Input Mode` field numbers it. */
export enum InputMode {
    Undefined = 0,
    Mouse = 1,
    Touch = 2,
    GamePad = 3,
    /** Retained in the enum although the docs' member list omits it. */
    MotionController_Deprecated = 4,
    /** One past the last mode; a client cannot send this value. */
    Count = 5
}

/** Whether the player is in the normal game or a legacy VR play mode. */
export enum ClientPlayMode {
    Normal = 0,
    Teaser = 1,
    Screen = 2,
    ExitLevel = 7,
    /** One past the last mode; a client cannot send this value. */
    NumModes = 9
}

/** How the client selects a block target. */
export enum NewInteractionModel {
    Touch = 0,
    Crosshair = 1,
    Classic = 2,
    /** One past the last model; a client cannot send this value. */
    Count = 3
}

/** A two-float vector used for rotations and movement input. */
export interface InputVector2 {
    x: number;
    y: number;
}

/** One `PlayerBlockActionData`: an action, the block position, and its face or action data. */
export interface PlayerBlockAction {
    /** `Player Action Type`, using the same values as `PlayerActionPacket`. */
    action: number;
    /** `Position`; `StopDestroyBlock` sends the default position rather than omitting it. */
    position: BlockPos;
    /** `Facing`, or action-specific integer data for `AbortDestroyBlock`. */
    face: number;
}

/**
 * A `PackedItemUseLegacyInventoryTransaction`, carried when the player uses an item this tick.
 *
 * It has the same legacy request, actions, and use-item body as `InventoryTransactionPacket`,
 * but omits the outer transaction type because the field itself identifies the variant.
 */
export interface AuthInputItemUse extends LegacyTransactionRequest {
    /** The inventory slots and their old and new network item descriptors. */
    actions: InventoryActionData[];
    /** The use-item body, with the held item as a network stack descriptor. */
    data: UseItemData;
}

/** The fields carried by one client `PlayerAuthInputPacket`. */
export interface PlayerAuthInput {
    /** `Player Rotation` X, the pitch at the start of the tick. */
    pitch: number;
    /** `Player Rotation` Y, the yaw at the start of the tick. */
    yaw: number;
    /** The client's predicted position at the end of the tick. */
    position: Vector3;
    /** Desired direction of travel in the player's own frame. */
    moveVector: InputVector2;
    /** `Player Head Rotation`. */
    headYaw: number;
    /** Input flags set during this tick. Unknown values are kept for the server to reject. */
    inputData: Set<number>;
    /** `Input Mode`. */
    inputMode: number;
    /** `Play Mode`. */
    playMode: number;
    /** `New Interaction Model`. */
    interactionModel: number;
    /** Where the player is looking for interactions, as pitch and yaw. */
    interactRotation: InputVector2;
    /** Client simulation frame. */
    tick: bigint;
    /** The client's predicted velocity at the end of the tick. */
    delta: Vector3;
    /** Item use in this tick, or `null` when the presence byte is zero. */
    itemUseTransaction: AuthInputItemUse | null;
    /** An inventory request, or `null` when the presence byte is zero. */
    itemStackRequest: ItemStackRequest | null;
    /** Block actions, or `null` when the presence byte is zero. */
    blockActions: PlayerBlockAction[] | null;
    /** Vehicle rotation, or `null` when the presence byte is zero. */
    vehicleRotation: InputVector2 | null;
    /** Predicted vehicle runtime id, or `null` when the presence byte is zero. */
    predictedVehicle: bigint | null;
    /** Movement direction before input permissions were applied. */
    analogMoveVector: InputVector2;
    /** World-space direction the camera is pointing. */
    cameraOrientation: Vector3;
    /** Raw movement direction. */
    rawMoveVector: InputVector2;
}

/** Reads the packed use-item transaction nested inside `PlayerAuthInput`. */
const readItemUse = (stream: BinaryStream): AuthInputItemUse => {
    const legacyRequestId = stream.readVarInt();
    const legacySlotChanges = stream.readBoolean()
        ? Array.from({ length: stream.readUnsignedVarInt() }, () => LegacySlotChange.fromNetwork(stream))
        : [];
    const actionCount = stream.readUnsignedVarInt();
    if (actionCount > MAX_INVENTORY_ACTIONS) {
        throw new RangeError(
            `A PlayerAuthInput item use carried ${actionCount} actions; the docs allow ${MAX_INVENTORY_ACTIONS}`
        );
    }
    const actions = Array.from({ length: actionCount }, () => readInventoryAction(stream));

    return { legacyRequestId, legacySlotChanges, actions, data: readUseItemData(stream) };
};

/** Writes the packed use-item transaction nested inside `PlayerAuthInput`. */
const writeItemUse = (stream: BinaryStream, use: AuthInputItemUse): void => {
    stream.writeVarInt(use.legacyRequestId);
    const carriesLegacySlots = hasLegacyRequest(use.legacyRequestId);
    stream.writeBoolean(carriesLegacySlots);
    if (carriesLegacySlots) {
        stream.writeUnsignedVarInt(use.legacySlotChanges.length);
        for (const change of use.legacySlotChanges) change.toNetwork(stream);
    }

    stream.writeUnsignedVarInt(use.actions.length);
    for (const action of use.actions) writeInventoryAction(stream, action);
    writeUseItemData(stream, use.data);
};

/** Reads `PlayerAuthInputPacket` fields in the order the client sends them. */
export const readPlayerAuthInput = (stream: BinaryStream): PlayerAuthInput => {
    const pitch = stream.readFloatLE();
    const yaw = stream.readFloatLE();
    const position = NetworkUtil.readVector3(stream);
    const moveVector = readVec2(stream);
    const headYaw = stream.readFloatLE();

    const flagCount = stream.readUnsignedVarInt();
    if (flagCount > INPUT_FLAG_COUNT) {
        throw new RangeError(`PlayerAuthInput claims ${flagCount} input flags; there are ${INPUT_FLAG_COUNT}`);
    }
    const inputData = new Set(Array.from({ length: flagCount }, () => stream.readVarInt()));

    const inputMode = stream.readUnsignedVarInt();
    const playMode = stream.readUnsignedVarInt();
    const interactionModel = stream.readVarInt();
    const interactRotation = readVec2(stream);
    const tick = stream.readUnsignedVarLong();
    const delta = NetworkUtil.readVector3(stream);

    const itemUseTransaction = stream.readBoolean() ? readItemUse(stream) : null;
    const itemStackRequest = stream.readBoolean() ? readItemStackRequest(stream) : null;

    let blockActions: PlayerBlockAction[] | null = null;
    if (stream.readBoolean()) {
        const actionCount = stream.readUnsignedVarInt();
        if (actionCount > MAX_BLOCK_ACTIONS) {
            throw new RangeError(
                `PlayerAuthInput claims ${actionCount} block actions; the docs allow ${MAX_BLOCK_ACTIONS}`
            );
        }
        blockActions = Array.from({ length: actionCount }, () => ({
            action: stream.readVarInt(),
            position: new BlockPos(stream.readVarInt(), stream.readVarInt(), stream.readVarInt()),
            face: stream.readVarInt()
        }));
    }

    const vehicleRotation = stream.readBoolean() ? readVec2(stream) : null;
    const predictedVehicle = stream.readBoolean() ? stream.readVarLong() : null;

    return {
        pitch,
        yaw,
        position,
        moveVector,
        headYaw,
        inputData,
        inputMode,
        playMode,
        interactionModel,
        interactRotation,
        tick,
        delta,
        itemUseTransaction,
        itemStackRequest,
        blockActions,
        vehicleRotation,
        predictedVehicle,
        analogMoveVector: readVec2(stream),
        cameraOrientation: NetworkUtil.readVector3(stream),
        rawMoveVector: readVec2(stream)
    };
};

/** Writes every `PlayerAuthInputPacket` field in the order the client sends it. */
export const writePlayerAuthInput = (stream: BinaryStream, input: PlayerAuthInput): void => {
    stream.writeFloatLE(input.pitch);
    stream.writeFloatLE(input.yaw);
    NetworkUtil.writeVector3(stream, input.position);
    writeVec2(stream, input.moveVector);
    stream.writeFloatLE(input.headYaw);

    stream.writeUnsignedVarInt(input.inputData.size);
    for (const flag of input.inputData) stream.writeVarInt(flag);

    stream.writeUnsignedVarInt(input.inputMode);
    stream.writeUnsignedVarInt(input.playMode);
    stream.writeVarInt(input.interactionModel);
    writeVec2(stream, input.interactRotation);
    stream.writeUnsignedVarLong(input.tick);
    NetworkUtil.writeVector3(stream, input.delta);

    stream.writeBoolean(input.itemUseTransaction !== null);
    if (input.itemUseTransaction !== null) writeItemUse(stream, input.itemUseTransaction);

    stream.writeBoolean(input.itemStackRequest !== null);
    if (input.itemStackRequest !== null) writeItemStackRequest(stream, input.itemStackRequest);

    stream.writeBoolean(input.blockActions !== null);
    if (input.blockActions !== null) {
        stream.writeUnsignedVarInt(input.blockActions.length);
        for (const action of input.blockActions) {
            stream.writeVarInt(action.action);
            action.position.serialize(stream);
            stream.writeVarInt(action.face);
        }
    }

    stream.writeBoolean(input.vehicleRotation !== null);
    if (input.vehicleRotation !== null) writeVec2(stream, input.vehicleRotation);
    stream.writeBoolean(input.predictedVehicle !== null);
    if (input.predictedVehicle !== null) stream.writeVarLong(input.predictedVehicle);

    writeVec2(stream, input.analogMoveVector);
    NetworkUtil.writeVector3(stream, input.cameraOrientation);
    writeVec2(stream, input.rawMoveVector);
};

const readVec2 = (stream: BinaryStream): InputVector2 => ({ x: stream.readFloatLE(), y: stream.readFloatLE() });

const writeVec2 = (stream: BinaryStream, vector: InputVector2): void => {
    stream.writeFloatLE(vector.x);
    stream.writeFloatLE(vector.y);
};
