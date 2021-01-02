import ContainerIds from './ContainerIds';
import Inventory from './Inventory';

export default class WindowManager {
    private readonly windows: Map<number, Inventory> = new Map();

    public setWindow(inventory: Inventory, id?: number): number {
        if (this.getWindowId(inventory) !== ContainerIds.None) {
            return this.getWindowId(inventory);
        }

        if (id && this.getWindow(id) !== null)
            throw new Error(`Window with id ${id} already exists`);

        this.windows.set(id ?? (id = this.windows.size + 1), inventory);
        return id;
    }

    public removeWindow(id: number) {
        if (this.getWindow(id) === null)
            throw new Error(`Window with id ${id} doesn't exist`);
        this.windows.delete(id);
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
