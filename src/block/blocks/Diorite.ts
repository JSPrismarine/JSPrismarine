import Stone, { StoneType } from './Stone';
import Item from '../../item';
import Prismarine from '../../Prismarine';

export default class Diorite extends Stone {
    constructor() {
        super('minecraft:diorite', StoneType.Diorite);
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getBlockManager().getBlock('minecraft:diorite')
        ];
    }
};
