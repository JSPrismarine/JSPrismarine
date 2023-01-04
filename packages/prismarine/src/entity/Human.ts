import Entity from './Entity.js';
import HumanInventory from '../inventory/HumanInventory.js';

/**
 * @internal
 */
export default class Human extends Entity {
    public static MOB_ID = 'minecraft:player';
    protected inventory = new HumanInventory();

    public getInventory(): HumanInventory {
        return this.inventory;
    }
}
