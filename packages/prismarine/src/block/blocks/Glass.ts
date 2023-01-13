import type Block from '../Block.js';
import { BlockIdsType } from '../BlockIdsType.js';
import type Item from '../../item/Item.js';
import type Server from '../../Server.js';
import Transparent from '../Transparent.js';

export default class Glass extends Transparent {
    public constructor(name = 'minecraft:glass', id: BlockIdsType = BlockIdsType.Glass) {
        super({
            name,
            id,
            hardness: 0.3
        });
    }

    /**
     * Glass doesn't drop anything unless it's broken by silk touch
     */
    public getDropsForCompatibleTool(item: Item | null, server: Server): Array<Block | Item | null> {
        return [];
    }
}
