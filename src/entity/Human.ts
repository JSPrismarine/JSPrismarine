import Entity from './entity';
import HumanInventory from '../inventory/HumanInventory';

export default class Human extends Entity {
    protected inventory = new HumanInventory();

    public getInventory(): HumanInventory {
        return this.inventory;
    }
}
