import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import BlockPosition from '../../world/BlockPosition';
import InventoryTransactionPacket, { HandSlot, TransactionType } from './InventoryTransactionPacket';
import { inventoryTransactionPacket } from '@jsprismarine/protocol/wire/definitions/inventoryTransaction';

import type { ReleaseItemData, UseItemData, UseItemOnEntityData } from './InventoryTransactionPacket';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class inserted a Hand
 * byte into the use-on-actor body and appended one to the release-item body; the 2193 class
 * wrote the documented bodies without either.
 */
describe('the declarative InventoryTransaction layout against the packet classes it replaces', () => {
    const useItemData = (): UseItemData => ({
        kind: 'useItem',
        actionType: 1,
        triggerType: 1,
        blockPosition: new BlockPosition(1, -60, 2),
        blockFace: 4,
        hotbarSlot: 2,
        hand: HandSlot.MAINHAND,
        itemInHand: Item.air(),
        playerPosition: new Vector3(0.5, 64, -2),
        clickPosition: new Vector3(0.25, 0.5, 1),
        blockRuntimeId: 42,
        clientInteractPrediction: 0,
        clientCooldownState: 0
    });

    const useOnEntityData = (): UseItemOnEntityData => ({
        kind: 'useItemOnEntity',
        entityRuntimeId: 42n,
        actionType: 1,
        hotbarSlot: 2,
        itemInHand: Item.air(),
        playerPosition: new Vector3(0, 64, 0),
        clickPosition: new Vector3(0.5, 1, 0.5)
    });

    const releaseData = (): ReleaseItemData => ({
        kind: 'releaseItem',
        actionType: 0,
        hotbarSlot: 3,
        itemInHand: Item.air(),
        playerPosition: new Vector3(1.5, 64, -2.25)
    });

    /**
     * The same body as the layout carries it: the stack as a `NetworkItemStackDescriptor`,
     * which is the only difference between the server's form and the wire's.
     */
    const wire = (data: UseItemData | UseItemOnEntityData | ReleaseItemData) => ({
        ...data,
        itemInHand: data.itemInHand.toStackDescriptor(new BinaryStream())
    });

    const fill = <T extends InventoryTransactionPacket>(
        packet: T,
        type: TransactionType,
        data: UseItemData | UseItemOnEntityData | ReleaseItemData
    ): T => {
        packet.legacyRequestId = 0;
        packet.legacySlotChanges = [];
        packet.transactionType = type;
        packet.inventoryActions = [];
        packet.transactionData = data;
        return packet;
    };

    const payload = (type: TransactionType, data: UseItemData | UseItemOnEntityData | ReleaseItemData) => {
        const transaction = { transactionType: type, inventoryActions: [], transactionData: wire(data), hand: 0 };
        return {
            legacyRequest: { legacyRequestId: 0, legacySlotChanges: [] },
            transaction,
            transactionWithHand: transaction
        };
    };

    const cases: Array<[string, TransactionType, () => UseItemData | UseItemOnEntityData | ReleaseItemData]> = [
        ['use-item', TransactionType.USE_ITEM, useItemData],
        ['use-item-on-entity', TransactionType.USE_ITEM_ON_ENTITY, useOnEntityData],
        ['release-item', TransactionType.RELEASE_ITEM, releaseData]
    ];

    for (const [name, type, data] of cases) {
        it(`matches the 2193 class byte for byte for a ${name} transaction`, () => {
            const classPacket = fill(new InventoryTransactionPacket(), type, data());
            classPacket.encodePayload();

            const stream = new BinaryStream();
            layoutAt(inventoryTransactionPacket, 2193).encode(stream, payload(type, data()));

            expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
        });

        it(`matches the class stamped 2225 byte for byte for a ${name} transaction`, () => {
            const classPacket = fill(new InventoryTransactionPacket(), type, data());
            classPacket.codecProtocol = 2225;
            classPacket.hand = HandSlot.OFFHAND;
            classPacket.encodePayload();

            const stream = new BinaryStream();
            layoutAt(inventoryTransactionPacket, 2225).encode(stream, {
                ...payload(type, data()),
                transactionWithHand: {
                    transactionType: type,
                    inventoryActions: [],
                    transactionData: wire(data()),
                    hand: 1
                }
            });

            expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
        });
    }

    it('appends exactly the trailing Hand byte to a release-item transaction at 2225', () => {
        const base = new BinaryStream();
        layoutAt(inventoryTransactionPacket, 2193).encode(base, payload(TransactionType.RELEASE_ITEM, releaseData()));

        const extended = new BinaryStream();
        layoutAt(inventoryTransactionPacket, 2225).encode(
            extended,
            payload(TransactionType.RELEASE_ITEM, releaseData())
        );

        expect(extended.getBuffer()).toEqual(Buffer.concat([base.getBuffer(), Buffer.from([0])]));
    });

    it('inserts exactly the Hand byte between the hotbar slot and the item at 2225', () => {
        const base = new BinaryStream();
        layoutAt(inventoryTransactionPacket, 2193).encode(
            base,
            payload(TransactionType.USE_ITEM_ON_ENTITY, useOnEntityData())
        );

        const extended = new BinaryStream();
        layoutAt(inventoryTransactionPacket, 2225).encode(extended, {
            ...payload(TransactionType.USE_ITEM_ON_ENTITY, useOnEntityData()),
            transactionWithHand: {
                transactionType: TransactionType.USE_ITEM_ON_ENTITY,
                inventoryActions: [],
                transactionData: wire(useOnEntityData()),
                hand: HandSlot.OFFHAND
            }
        });

        // Request id, slots presence, type, actions count, runtime id, action type, slot: one
        // varint byte each at these values, so the inserted Hand byte sits at offset 7.
        const bytes = base.getBuffer();
        expect(extended.getBuffer()).toEqual(
            Buffer.concat([bytes.subarray(0, 7), Buffer.from([HandSlot.OFFHAND]), bytes.subarray(7)])
        );
    });

    it('decodes what the class encoded, at the version the class speaks', () => {
        const classPacket = fill(
            new InventoryTransactionPacket(),
            TransactionType.USE_ITEM_ON_ENTITY,
            useOnEntityData()
        );
        classPacket.encodePayload();

        const read = layoutAt(inventoryTransactionPacket, 2193).decode(new BinaryStream(classPacket.getBuffer()));
        expect(read.transaction).toMatchObject({
            transactionType: TransactionType.USE_ITEM_ON_ENTITY,
            hand: HandSlot.MAINHAND
        });
        expect(read.transaction!.transactionData).toMatchObject({ entityRuntimeId: 42n, hotbarSlot: 2 });
        expect(read.transactionWithHand).toBeNull();
    });
});
