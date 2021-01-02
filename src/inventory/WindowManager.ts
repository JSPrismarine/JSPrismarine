import ContainerIds from './ContainerIds';
import Inventory from './Inventory';

export default class WindowManager {
    private readonly windows: Map<number, Inventory> = new Map();

    public setWindow(inventory: Inventory, id?: number): number {
        if (this.getWindowId(inventory) !== ContainerIds.None) {
            return this.getWindowId(inventory);
        }

        if (id) {
            if (this.getWindow(id) !== null) {
                return this.setWindow(inventory, id + 1);
            }
        }

        this.windows.set(id ?? (id = this.windows.size + 1), inventory);
        return id;
    }

    public getWindowId(inventory: Inventory): number {
        return (
            Array.from(this.windows.keys()).find(
                (key) => this.windows.get(key) === inventory
            ) ?? ContainerIds.None
        );
    }

    public getWindow(id: number): Inventory | null {
        return this.windows.get(id) ?? null;
    }
}
