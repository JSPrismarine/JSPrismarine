import Block from '../'
import { BlockToolType } from '../BlockToolType';

export default class Grass extends Block {
    constructor() {
        super({
            name: 'minecraft:grass',
            id: 2,
            hardness: 0.6
        });
    }

    getToolType() {
        return BlockToolType.Shovel;
    }

    getDropsForCompatibleTool() {
        return this; // TODO: dirt
    }
};
