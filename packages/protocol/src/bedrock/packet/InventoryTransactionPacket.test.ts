import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import { emptyItemStackDescriptor } from '../wire/structures/ItemStackDescriptor';
import { HandSlot, InventorySourceType, TransactionType } from '../wire/structures/InventoryTransaction';
import InventoryTransactionPacket from './InventoryTransactionPacket';

import type { InventoryTransaction } from './InventoryTransactionPacket';
import { enumDumpMembers } from '../../testing/evidence.test.helper';

/** The eight zero bytes of an empty `NetworkItemStackDescriptor`. */
const AIR = [0, 0, 0, 0, 0, 0, 0, 0];

/** A little-endian float, as the docs' `Vec3` components are written. */
const floatLE = (value: number): number[] => Array.from(new Uint8Array(new Float32Array([value]).buffer));

const encode = (data: InventoryTransaction, protocol: number): number[] => {
    const packet = new InventoryTransactionPacket(data);
    packet.codecProtocol = protocol;
    return [...packet.serialize(new NetworkBinaryStream())];
};

const decode = (bytes: number[], protocol: number): InventoryTransaction => {
    const stream = new NetworkBinaryStream(Buffer.from(bytes));
    const packet = new InventoryTransactionPacket();
    packet.codecProtocol = protocol;
    const data = packet.deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

const noLegacyRequest = { legacyRequestId: 0, legacySlotChanges: [] };

/** From Position (1.5, 64, -2.25) and, for an actor use, Hit Position (0.5, 1, 0.5). */
const FROM_POSITION = [...floatLE(1.5), ...floatLE(64), ...floatLE(-2.25)];
const HIT_POSITION = [...floatLE(0.5), ...floatLE(1), ...floatLE(0.5)];

describe('InventoryTransactionPacket', () => {
    it('is packet 30', () => {
        expect(new InventoryTransactionPacket().id).toBe(PacketIdentifier.INVENTORY_TRANSACTION);
        expect(PacketIdentifier.INVENTORY_TRANSACTION).toBe(30);
    });

    it('numbers the inventory source types as the pinned game dump does, with the TODO source at 99999', () => {
        // No Bedrock Dedicated Server capture of this packet exists, so the dump is the
        // executable evidence: the 1.26.50 page prints that member as 4, the 1.26.60 page and
        // its changelog print 99999, and the dump from before both agrees with 1.26.60.
        const expected = Object.entries(InventorySourceType)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
            .map(([, value]) => value);
        const dump = enumDumpMembers('InventorySourceType');

        expect(dump.map(({ value }) => value)).toEqual(expected);
        expect(dump.at(-1)).toEqual({ name: 'Non Implemented Feature TODO', value: 99999 });
    });

    describe('Hand, which 1.26.60 added to two transaction bodies', () => {
        const useOnActor = (hand: number): InventoryTransaction => ({
            legacyRequest: noLegacyRequest,
            transactionType: TransactionType.USE_ITEM_ON_ENTITY,
            inventoryActions: [],
            hand,
            transactionData: {
                kind: 'useItemOnEntity',
                entityRuntimeId: 42n,
                actionType: 1,
                hotbarSlot: 2,
                itemInHand: emptyItemStackDescriptor(),
                playerPosition: new Vector3(1.5, 64, -2.25),
                clickPosition: new Vector3(0.5, 1, 0.5)
            }
        });

        const release = (hand: number): InventoryTransaction => ({
            legacyRequest: noLegacyRequest,
            transactionType: TransactionType.RELEASE_ITEM,
            inventoryActions: [],
            hand,
            transactionData: {
                kind: 'releaseItem',
                actionType: 0,
                hotbarSlot: 3,
                itemInHand: emptyItemStackDescriptor(),
                playerPosition: new Vector3(1.5, 64, -2.25)
            }
        });

        // Header, Legacy Request ID 0, no Legacy Set Item Slots, variant 3, no Actions.
        const ACTOR_PREFIX = [0x1e, 0x00, 0x00, 0x03, 0x00];
        // Header, Legacy Request ID 0, no Legacy Set Item Slots, variant 4, no Actions.
        const RELEASE_PREFIX = [0x1e, 0x00, 0x00, 0x04, 0x00];

        // Runtime Id 42, Action Type Attack (ZigZag 2), Slot 2 (ZigZag 4).
        const ACTOR_HEAD = [0x2a, 0x02, 0x04];
        // Action Type Release (0), Slot 3 (ZigZag 6).
        const RELEASE_HEAD = [0x00, 0x06];

        it('leaves the use-on-actor body without a Hand at 2193', () => {
            const bytes = [...ACTOR_PREFIX, ...ACTOR_HEAD, ...AIR, ...FROM_POSITION, ...HIT_POSITION];

            expect(encode(useOnActor(HandSlot.MAINHAND), 2193)).toEqual(bytes);
            expect(decode(bytes, 2193)).toMatchObject({ hand: 0, transactionData: { entityRuntimeId: 42n } });
        });

        it('puts the use-on-actor Hand between the slot and the item at 2225', () => {
            const bytes = [...ACTOR_PREFIX, ...ACTOR_HEAD, 0x01, ...AIR, ...FROM_POSITION, ...HIT_POSITION];

            expect(encode(useOnActor(HandSlot.OFFHAND), 2225)).toEqual(bytes);
            expect(decode(bytes, 2225)).toMatchObject({
                hand: HandSlot.OFFHAND,
                transactionData: { entityRuntimeId: 42n, hotbarSlot: 2 }
            });
        });

        it('leaves the release body without a Hand at 2193', () => {
            const bytes = [...RELEASE_PREFIX, ...RELEASE_HEAD, ...AIR, ...FROM_POSITION];

            expect(encode(release(HandSlot.MAINHAND), 2193)).toEqual(bytes);
            expect(decode(bytes, 2193)).toMatchObject({ hand: 0, transactionData: { hotbarSlot: 3 } });
        });

        it('appends the release Hand after the position at 2225', () => {
            const bytes = [...RELEASE_PREFIX, ...RELEASE_HEAD, ...AIR, ...FROM_POSITION, 0x01];

            expect(encode(release(HandSlot.OFFHAND), 2225)).toEqual(bytes);
            expect(decode(bytes, 2225)).toMatchObject({ hand: HandSlot.OFFHAND, transactionData: { hotbarSlot: 3 } });
        });
    });

    it.each([2193, 2225])(
        'writes the use-item body identically at protocol %i: its Hand was added at 2193',
        (protocol) => {
            const data: InventoryTransaction = {
                legacyRequest: noLegacyRequest,
                transactionType: TransactionType.USE_ITEM,
                inventoryActions: [],
                hand: 0,
                transactionData: {
                    kind: 'useItem',
                    actionType: 0,
                    triggerType: 1,
                    blockPosition: new Vector3(1, 2, 3),
                    blockFace: 1,
                    hotbarSlot: 4,
                    hand: HandSlot.OFFHAND,
                    itemInHand: emptyItemStackDescriptor(),
                    playerPosition: new Vector3(1.5, 64, -2.25),
                    clickPosition: new Vector3(0.5, 1, 0.5),
                    blockRuntimeId: 7,
                    clientInteractPrediction: 1,
                    clientCooldownState: 0
                }
            };
            const body = new BinaryStream();
            body.writeVarInt(0); // Action Type: Place.
            body.writeByte(1); // Trigger Type: Player Input.
            body.writeVarInt(1); // Position, as a BlockPos of three varint32s.
            body.writeVarInt(2);
            body.writeVarInt(3);
            body.writeByte(1); // Face.
            body.writeVarInt(4); // Slot.
            body.writeByte(1); // Hand: Offhand.
            const bytes = [
                0x1e,
                0x00,
                0x00,
                0x02,
                0x00,
                ...body.getBuffer(),
                ...AIR,
                ...FROM_POSITION,
                ...HIT_POSITION,
                0x07, // Target Block Id.
                0x01, // Client Interact Prediction: Success.
                0x00 // Client Cooldown State: Off.
            ];

            expect(encode(data, protocol)).toEqual(bytes);
            expect(decode(bytes, protocol)).toMatchObject({
                transactionType: TransactionType.USE_ITEM,
                transactionData: { hand: HandSlot.OFFHAND, hotbarSlot: 4, blockRuntimeId: 7 }
            });
        }
    );
});
