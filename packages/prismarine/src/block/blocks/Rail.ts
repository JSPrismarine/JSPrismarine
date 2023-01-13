import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Transparent from '../Transparent.js';

export default class Rail extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:rail',
            id: BlockIdsType.Rail,
            hardness: 0.7
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
