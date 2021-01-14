import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

export default class Rail extends Transparent {
    constructor() {
        super({
            name: 'minecraft:rail',
            id: BlockIdsType.Rail,
            hardness: 0.7
        });
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }
}
