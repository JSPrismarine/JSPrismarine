import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class Bedrock extends Solid {
    constructor() {
        super({
            name: 'minecraft:bedrock',
            id: BlockIdsType.Bedrock,
            hardness: -1
        });
    }

    isBreakable() {
        return false;
    }

    getBlastResistance() {
        return 18000000;
    }
}
