import HumanInventory from '../inventory/HumanInventory';
import Entity from './entity';

export default class Human extends Entity {
    protected inventory = new HumanInventory();

    public getInventory(): HumanInventory {
        return this.inventory;
    }
}
