import Player from '../player/Player';
import ContainerEntry from './ContainerEntry';

export interface InventoryActionItem {
    id: number;
    meta: number;
}

export default class InventoryAction {
    private source: ContainerEntry;
    private target: ContainerEntry;

    constructor(source: ContainerEntry, target: ContainerEntry) {
        this.source = source;
        this.target = target;
    }

    public getSource(): ContainerEntry {
        return this.source;
    }

    public getTarget(): ContainerEntry {
        return this.target;
    }

    public isValid(player: Player): boolean {
        return false;
    }

    public handle() {}
}
