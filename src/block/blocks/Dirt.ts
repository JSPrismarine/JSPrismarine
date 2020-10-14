import Block from '../'
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Grass extends Block {
    constructor() {
        super({
            name: 'minecraft:dirt',
            id: BlockIdsType.Dirt,
            hardness: 0.5
        });
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
};
