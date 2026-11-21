import { WindowIds } from '@jsprismarine/minecraft';
import type { ProtocolContext } from '@jsprismarine/protocol';
import { MobEquipmentPacket } from '@jsprismarine/protocol';
import type { MobEquipmentPayload } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import { decodeView } from '../../testing/decodeView.test-utils';
import MobEquipmentDecoder from './MobEquipmentDecoder';

const protocolContext: ProtocolContext = { protocolVersion: 2193 };

/** What a client sends when it selects a hotbar slot: both slot fields name it, container 0. */
const selected = (slot: number, overrides: Partial<MobEquipmentPayload> = {}): MobEquipmentPacket =>
    new MobEquipmentPacket({
        runtimeEntityId: 0n,
        item: Item.air().toStackDescriptor(protocolContext),
        inventorySlot: slot,
        hotbarSlot: slot,
        windowId: WindowIds.INVENTORY,
        ...overrides
    });

describe('MobEquipmentDecoder', () => {
    it('decodes a hotbar selection, ignoring the stack the client claims to hold', () => {
        const { view, logged } = decodeView();
        const packet = selected(3, {
            item: new Item({ runtimeId: 0, name: 'minecraft:bedrock' }).toStackDescriptor(protocolContext)
        });

        expect(new MobEquipmentDecoder().decode(packet, view)).toStrictEqual([{ kind: 'selectHotbarSlot', slot: 3 }]);
        expect(logged).toEqual([]);
    });

    it('accepts an offhand report and decodes nothing, without a log', () => {
        const { view, logged } = decodeView();

        expect(new MobEquipmentDecoder().decode(selected(0, { windowId: WindowIds.OFFHAND }), view)).toEqual([]);
        expect(logged).toEqual([]);
    });

    it.each([WindowIds.ARMOR, WindowIds.PLAYER_ONLY_UI, 1, 255])('drops a report for container %i', (windowId) => {
        const { view, logged } = decodeView();

        expect(new MobEquipmentDecoder().decode(selected(2, { windowId }), view)).toEqual([]);
        expect(logged).toHaveLength(1);
    });

    it.each([9, 35, 255])('drops a selected slot of %i, which is outside the hotbar', (slot) => {
        const { view, logged } = decodeView();

        expect(new MobEquipmentDecoder().decode(selected(slot), view)).toEqual([]);
        expect(logged).toHaveLength(1);
    });

    it('drops a hotbar selection whose slot field is outside the hotbar', () => {
        const { view, logged } = decodeView();

        expect(new MobEquipmentDecoder().decode(selected(2, { inventorySlot: 40 }), view)).toEqual([]);
        expect(logged).toHaveLength(1);
    });
});
