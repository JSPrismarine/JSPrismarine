/**
 * `PlayerAuthInputPacket`: the client's input for one movement tick.
 *
 * The payload is the predicted position and rotation, the input flags set this tick, the
 * input and interaction modes, then five optional sections (item use, an item stack request,
 * block actions, vehicle rotation, predicted vehicle) and three trailing vectors, in the order
 * on Mojang's packet page. An item stack request's action ids changed at protocol 2225, and a
 * wire type has no protocol to consult, so the request is declared twice, once per action id
 * table, under the gates that admit each. Exactly one travels at any version; the other stays
 * `null`, and `PlayerAuthInputPacket` folds the pair back into one `itemStackRequest`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-auth-input-packet/
 */
import { definePacket, gated } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { blockPosStructure, vector3 } from '../structureTypes';
import {
    hasLegacyRequest,
    LegacySlotChange,
    MAX_INVENTORY_ACTIONS,
    readInventoryAction,
    readUseItemData,
    writeInventoryAction,
    writeUseItemData
} from '../structures/InventoryTransaction';
import { readItemStackRequest, writeItemStackRequest } from '../structures/ItemStackRequest';
import { INPUT_FLAG_COUNT, MAX_BLOCK_ACTIONS } from '../structures/PlayerAuthInput';
import { protocolVersion as protocolVersion2193 } from '../versions/v2193';
import { protocolVersion as protocolVersion2225 } from '../versions/v2225';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type { PayloadOf } from '../../../wire/define';
import type { ItemStackRequest } from '../structures/ItemStackRequest';
import type { AuthInputItemUse, PlayerBlockAction } from '../structures/PlayerAuthInput';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/** Two little-endian floats, `x` then `y`: a rotation or a movement vector. */
const vec2 = t.record({ x: t.lf32, y: t.lf32 });

/**
 * `Input Data`: the set flags, as a varint count and one zigzag varint per flag.
 *
 * Reading refuses a count above the number of documented flags, so a stranger's number is
 * refused rather than allocated for. Unknown flag values are kept for the server to reject.
 */
const inputData = t.custom<Set<number>>(
    'set<PlayerAuthInputData>',
    (stream, flags) => {
        stream.writeUnsignedVarInt(flags.size);
        for (const flag of flags) stream.writeVarInt(flag);
    },
    (stream) => {
        const flagCount = stream.readUnsignedVarInt();
        if (flagCount > INPUT_FLAG_COUNT) {
            throw new ProtocolWireErrors.TooManyInputFlags({
                flagCount,
                inputFlagCount: INPUT_FLAG_COUNT
            });
        }
        return new Set(Array.from({ length: flagCount }, () => stream.readVarInt()));
    }
);

/**
 * `PackedItemUseLegacyInventoryTransaction`: the legacy request, the inventory actions and
 * the use-item body, without the outer transaction type. The legacy slot changes travel only
 * when the request id names one; reading refuses more actions than the docs allow.
 */
const itemUse = t.custom<AuthInputItemUse>(
    'PackedItemUseLegacyInventoryTransaction',
    (stream, use) => {
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
    },
    (stream) => {
        const legacyRequestId = stream.readVarInt();
        const legacySlotChanges = stream.readBoolean()
            ? Array.from({ length: stream.readUnsignedVarInt() }, () => LegacySlotChange.fromNetwork(stream))
            : [];
        const actionCount = stream.readUnsignedVarInt();
        if (actionCount > MAX_INVENTORY_ACTIONS) {
            throw new ProtocolWireErrors.TooManyItemUseActions({
                actionCount,
                maxInventoryActions: MAX_INVENTORY_ACTIONS
            });
        }
        const actions = Array.from({ length: actionCount }, () => readInventoryAction(stream));

        return { legacyRequestId, legacySlotChanges, actions, data: readUseItemData(stream) };
    }
);

/** One `PlayerBlockActionData`: the action, the block position and the facing. */
const blockAction = t.record({ action: t.varint32, position: blockPosStructure, face: t.varint32 });

/**
 * `Block Actions`: a varint count, then that many {@link blockAction} entries.
 *
 * Reading refuses a count above {@link MAX_BLOCK_ACTIONS}, so a stranger's number is refused
 * rather than allocated for.
 */
const blockActions = t.custom<PlayerBlockAction[]>(
    'list<PlayerBlockActionData>',
    (stream, actions) => {
        stream.writeUnsignedVarInt(actions.length);
        for (const action of actions) blockAction.write(stream, action);
    },
    (stream) => {
        const actionCount = stream.readUnsignedVarInt();
        if (actionCount > MAX_BLOCK_ACTIONS) {
            throw new ProtocolWireErrors.TooManyBlockActions({
                actionCount,
                maxBlockActions: MAX_BLOCK_ACTIONS
            });
        }
        return Array.from({ length: actionCount }, () => blockAction.read(stream));
    }
);

/** `ItemStackRequest` with its action ids from the table of one protocol version. */
const itemStackRequestAt = (protocolVersion: number) =>
    t.custom<ItemStackRequest>(
        'ItemStackRequest',
        (stream, request) => writeItemStackRequest(stream, request, protocolVersion),
        (stream) => readItemStackRequest(stream, protocolVersion)
    );

/** The fields the client sends for every movement tick. */
export const playerAuthInputPacket = definePacket('PlayerAuthInputPacket', {
    /** `Player Rotation` X: the pitch at the start of the tick. */
    pitch: t.lf32,
    /** `Player Rotation` Y: the yaw at the start of the tick. */
    yaw: t.lf32,
    /** `Position`: the client's predicted position at the end of the tick. */
    position: vector3,
    /** `Move Vector`: the desired direction of travel in the player's own frame. */
    moveVector: vec2,
    /** `Player Head Rotation`: the head yaw. */
    headYaw: t.lf32,
    /** `Input Data`: the input flags set during this tick. */
    inputData,
    /** `Input Mode`: the input device. */
    inputMode: t.varuint32,
    /** `Play Mode`: the normal game or a legacy VR play mode. */
    playMode: t.varuint32,
    /** `New Interaction Model`: how the client selects a block target. */
    interactionModel: t.varint32,
    /** `Interact Rotation`: where the player is looking for interactions, as pitch and yaw. */
    interactRotation: vec2,
    /** `Client Tick`: the client's simulation frame. */
    tick: t.varuint64,
    /** `Position Delta`: the client's predicted velocity at the end of the tick. */
    delta: vector3,
    /** `Item Use Transaction`: item use this tick, behind a presence byte. */
    itemUseTransaction: t.optional(itemUse),
    /** `Item Stack Request` up to protocol 2193, with that version's action ids. */
    itemStackRequestUntil2225: gated<ItemStackRequest | null>(
        UNTIL_2225,
        t.optional(itemStackRequestAt(protocolVersion2193)),
        null
    ),
    /** `Item Stack Request` from protocol 2225, with `CraftReservedAction` inserted into the action ids. */
    itemStackRequestSince2225: gated<ItemStackRequest | null>(
        SINCE_2225,
        t.optional(itemStackRequestAt(protocolVersion2225)),
        null
    ),
    /** `Block Actions`: the block actions this tick, behind a presence byte. */
    blockActions: t.optional(blockActions),
    /** `Vehicle Rotation`: the vehicle's rotation, behind a presence byte. */
    vehicleRotation: t.optional(vec2),
    /** `Predicted Vehicle`: the predicted vehicle's actor id as a zigzag varint64, behind a presence byte. */
    predictedVehicle: t.optional(t.varint64),
    /** `Analog Move Vector`: the movement direction before input permissions were applied. */
    analogMoveVector: vec2,
    /** `Camera Orientation`: the world-space direction the camera is pointing. */
    cameraOrientation: vector3,
    /** `Raw Move Vector`: the raw movement direction. */
    rawMoveVector: vec2
});

/** The payload as the layout carries it: the item stack request under the key its version uses. */
export type PlayerAuthInputLayoutPayload = PayloadOf<typeof playerAuthInputPacket>;
