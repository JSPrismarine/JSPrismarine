import type {
    LegacyTransactionRequest,
    PlayerAuthInput as ProtocolPlayerAuthInput,
    ProtocolContext
} from '@jsprismarine/protocol';
import { BlockPos } from '@jsprismarine/protocol';

import type { UseItemData } from './InventoryTransactionAdapter';
import { InventoryAction, useItemDataFromProtocol, useItemDataToProtocol } from './InventoryTransactionAdapter';
import BlockPosition from '../world/BlockPosition';

/** The server's item-use form of the packed `PlayerAuthInput` transaction. */
export interface ServerAuthInputItemUse {
    legacyRequestId: number;
    legacySlotChanges: LegacyTransactionRequest['legacySlotChanges'];
    actions: InventoryAction[];
    data: UseItemData;
}

/** Player input after Protocol values are resolved into the server's coordinate and item types. */
export type ServerPlayerAuthInput = Omit<ProtocolPlayerAuthInput, 'blockActions' | 'itemUseTransaction'> & {
    blockActions: { action: number; position: BlockPosition; face: number }[] | null;
    itemUseTransaction: ServerAuthInputItemUse | null;
};

/** Resolves item stack descriptors and block positions for the game handlers. */
export const playerAuthInputFromProtocol = (
    input: ProtocolPlayerAuthInput,
    context: ProtocolContext
): ServerPlayerAuthInput => ({
    ...input,
    blockActions:
        input.blockActions?.map(({ action, position, face }) => ({
            action,
            position: new BlockPosition(position.x, position.y, position.z),
            face
        })) ?? null,
    itemUseTransaction:
        input.itemUseTransaction === null
            ? null
            : {
                  legacyRequestId: input.itemUseTransaction.legacyRequestId,
                  legacySlotChanges: input.itemUseTransaction.legacySlotChanges,
                  actions: input.itemUseTransaction.actions.map((action) => InventoryAction.fromWire(context, action)),
                  data: useItemDataFromProtocol(input.itemUseTransaction.data, context)
              }
});

/** Converts server values into the wire structures carried by a Protocol packet. */
export const playerAuthInputToProtocol = (
    input: ServerPlayerAuthInput,
    context: ProtocolContext
): ProtocolPlayerAuthInput => ({
    ...input,
    blockActions:
        input.blockActions?.map(({ action, position, face }) => ({
            action,
            position: new BlockPos(position.getX(), position.getY(), position.getZ()),
            face
        })) ?? null,
    itemUseTransaction:
        input.itemUseTransaction === null
            ? null
            : {
                  legacyRequestId: input.itemUseTransaction.legacyRequestId,
                  legacySlotChanges: input.itemUseTransaction.legacySlotChanges,
                  actions: input.itemUseTransaction.actions.map((action) => action.toWire(context)),
                  data: useItemDataToProtocol(input.itemUseTransaction.data, context)
              }
});
