import Inventory from './Inventory';

export enum WindowIds {
    UNKNOWN = -1,
    INVENTORY
}

export default class WindowManager {
    private readonly windows: Map<number, Inventory> = new Map() as Map<number, Inventory>;

    public setWindow(inventory: Inventory, id?: number): number {
        if (this.getWindowId(inventory) !== WindowIds.UNKNOWN) {
            return this.getWindowId(inventory);
        }

        if (id && this.getWindow(id) !== null) {
            return this.setWindow(inventory, id + 1);
        }

        this.windows.set(id ?? (id = this.windows.size + 1), inventory);
        return id;
    }

    public getWindowId(inventory: Inventory): number {
        return Array.from(this.windows.keys()).find((key) => this.windows.get(key) === inventory) ?? WindowIds.UNKNOWN;
    }

    public getWindow(id: number): Inventory | null {
        return this.windows.get(id) ?? null;
    }
}
