import { ContainerUiId, WindowTypes } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { blockSlotName, blockSlotOf, isTakeOnlySlot, screenStoresSlots } from './containerSlots';

describe('the slots a block screen owns', () => {
    it('numbers a chest from zero under one container', () => {
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.LEVEL_ENTITY_CONTAINER, 0, 27)).toBe(0);
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.LEVEL_ENTITY_CONTAINER, 26, 27)).toBe(26);
    });

    it('stops at the block slot count, so a double chest reaches 53 and a single one does not', () => {
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.LEVEL_ENTITY_CONTAINER, 27, 27)).toBeNull();
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.LEVEL_ENTITY_CONTAINER, 53, 54)).toBe(53);
    });

    it('answers a barrel and a shulker box under their own container names too', () => {
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.BARREL_CONTAINER, 3, 27)).toBe(3);
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.SHULKER_BOX_CONTAINER, 3, 27)).toBe(3);
    });

    it("puts a furnace's three slots in Bedrock's order: input, fuel, output", () => {
        expect(blockSlotOf(WindowTypes.FURNACE, ContainerUiId.FURNACE_INGREDIENT_CONTAINER, 0, 3)).toBe(0);
        expect(blockSlotOf(WindowTypes.FURNACE, ContainerUiId.FURNACE_FUEL_CONTAINER, 0, 3)).toBe(1);
        expect(blockSlotOf(WindowTypes.FURNACE, ContainerUiId.FURNACE_RESULT_CONTAINER, 0, 3)).toBe(2);
    });

    it('gives a blast furnace and a smoker their own ingredient container', () => {
        expect(blockSlotOf(WindowTypes.BLAST_FURNACE, ContainerUiId.BLAST_FURNACE_INGREDIENT_CONTAINER, 0, 3)).toBe(0);
        expect(blockSlotOf(WindowTypes.SMOKER, ContainerUiId.SMOKER_INGREDIENT_CONTAINER, 0, 3)).toBe(0);
    });

    it("puts a brewing stand's three bottles first, then the ingredient and the fuel", () => {
        expect(blockSlotOf(WindowTypes.BREWING_STAND, ContainerUiId.BREWING_STAND_RESULT_CONTAINER, 2, 5)).toBe(2);
        expect(blockSlotOf(WindowTypes.BREWING_STAND, ContainerUiId.BREWING_STAND_INPUT_CONTAINER, 0, 5)).toBe(3);
        expect(blockSlotOf(WindowTypes.BREWING_STAND, ContainerUiId.BREWING_STAND_FUEL_CONTAINER, 0, 5)).toBe(4);
    });

    it('refuses a container name the open screen does not use', () => {
        expect(blockSlotOf(WindowTypes.CONTAINER, ContainerUiId.FURNACE_FUEL_CONTAINER, 0, 27)).toBeNull();
        expect(blockSlotOf(WindowTypes.ENCHANTMENT, ContainerUiId.LEVEL_ENTITY_CONTAINER, 0, 27)).toBeNull();
    });

    it('names a slot back the way the client numbers it', () => {
        expect(blockSlotName(WindowTypes.CONTAINER, 30)).toEqual({
            containerId: ContainerUiId.LEVEL_ENTITY_CONTAINER,
            slotId: 30
        });
        expect(blockSlotName(WindowTypes.FURNACE, 1)).toEqual({
            containerId: ContainerUiId.FURNACE_FUEL_CONTAINER,
            slotId: 0
        });
        expect(blockSlotName(WindowTypes.BREWING_STAND, 4)).toEqual({
            containerId: ContainerUiId.BREWING_STAND_FUEL_CONTAINER,
            slotId: 0
        });
    });

    it("calls a furnace's output take-only and nothing else", () => {
        expect(isTakeOnlySlot(WindowTypes.FURNACE, 2)).toBe(true);
        expect(isTakeOnlySlot(WindowTypes.SMOKER, 2)).toBe(true);
        expect(isTakeOnlySlot(WindowTypes.FURNACE, 0)).toBe(false);
        // A player fills a brewing stand's bottle slots by hand, so they are not outputs.
        expect(isTakeOnlySlot(WindowTypes.BREWING_STAND, 0)).toBe(false);
        expect(isTakeOnlySlot(WindowTypes.CONTAINER, 0)).toBe(false);
    });

    it('says which screens store slots at all, so a workstation never builds a store', () => {
        expect(screenStoresSlots(WindowTypes.CONTAINER)).toBe(true);
        expect(screenStoresSlots(WindowTypes.HOPPER)).toBe(true);
        expect(screenStoresSlots(WindowTypes.CRAFTER)).toBe(true);
        expect(screenStoresSlots(WindowTypes.ENCHANTMENT)).toBe(false);
        expect(screenStoresSlots(WindowTypes.ANVIL)).toBe(false);
        expect(screenStoresSlots(WindowTypes.WORKBENCH)).toBe(false);
    });
});
