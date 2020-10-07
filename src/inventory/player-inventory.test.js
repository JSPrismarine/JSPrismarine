const PlayerInventory = require('./player-inventory');

describe('inventory', () => {
    describe('player-inventory', () => {
        const inventory = new PlayerInventory();
        
        it('inventory size should match expected size', () => {
            expect(inventory.getSlotCount()).toBe(36);
        });

        it('inventory hand slot should default to 0', () => {
            expect(inventory.getHandSlotIndex()).toBe(0);
        });
    });
});
