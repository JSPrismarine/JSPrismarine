import ContainerIds from '../inventory/ContainerIds';
import Entity from './entity';
import HumanInventory from '../inventory/HumanInventory';
import WindowManager from '../inventory/WindowManager';
import World from '../world/World';

export default class Human extends Entity {
    // TODO: finish implementation
    private windows: WindowManager;
    protected inventory = new HumanInventory();

    constructor(world: World) {
        super(world);
        this.windows = new WindowManager();

        this.getWindows().setWindow(
            new HumanInventory(),
            ContainerIds.Inventory
        );
    }

    public getInventory(): HumanInventory {
        const window = this.getWindows().getWindow(
            ContainerIds.Inventory
        ) as HumanInventory;
        if (!window) throw new Error(`Inventory window is missing`); // This should never occur

        return window;
    }

    public getWindows(): WindowManager {
        return this.windows;
    }
}
