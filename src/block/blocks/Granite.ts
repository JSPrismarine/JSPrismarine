import Stone, { StoneType } from './Stone';
import Item from '../../item';
import Prismarine from '../../prismarine';

export default class Granite extends Stone {
    constructor() {
        super('minecraft:granite', StoneType.Granite);
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getBlockManager().getBlock('minecraft:granite')
        ];
    }
};
