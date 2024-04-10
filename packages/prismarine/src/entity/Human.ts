import HumanInventory from '../inventory/HumanInventory';
import { Entity } from './';

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
