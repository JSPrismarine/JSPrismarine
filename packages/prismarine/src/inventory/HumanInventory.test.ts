import HumanInventory from './HumanInventory.js';

describe('inventory', () => {
    describe('PlayerInventory', () => {
        const inventory = new HumanInventory();

        it('inventory size should match expected size', () => {
            expect(inventory.getSlotCount()).toBe(36);
        });

        it('inventory hand slot should default to 0', () => {
            expect(inventory.getHandSlotIndex()).toBe(0);
        });
    });
});
