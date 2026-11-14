/**
 * The `PlayerAuthInput` payload and its nested structures.
 *
 * The packet carries the player's predicted position and input flags every tick, followed by
 * optional block actions, item use, an item stack request, and vehicle data. All coordinates
 * and item stacks remain in Protocol's wire structures; a server resolves them into its own
 * game objects at the packet boundary. The wire layout lives in the declarative definition
 * `wire/definitions/playerAuthInput.ts`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-auth-input-packet/
 */
import type { Vector3 } from '@jsprismarine/math';

import type BlockPos from '../../structure/BlockPos';
import type { ItemStackRequest } from './ItemStackRequest';
import type { InventoryActionData, LegacyTransactionRequest, UseItemData } from './InventoryTransaction';

/**
 * Input flags listed by Mojang for `PlayerAuthInputPacket`.
 *
 * The values follow the 1.26.60 page, with gaps at 2, 54 and 55; the 1.26.50 page prints dense
 * positions instead. Mojang's pinned enum dump (`packages/minecraft/datagen/snapshot/0e00fe80f4f3-enums.html`)
 * has the gapped numbers, and `PlayerAuthInputPacket.test.ts` asserts them against it.
 */
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
    /** `Client Predicted Vehicle`, an actor unique id, or `null` when the presence byte is zero. */
    predictedVehicle: bigint | null;
    /** Movement direction before input permissions were applied. */
    analogMoveVector: InputVector2;
    /** World-space direction the camera is pointing. */
    cameraOrientation: Vector3;
    /** Raw movement direction. */
    rawMoveVector: InputVector2;
}
