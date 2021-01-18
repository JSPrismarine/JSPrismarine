import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class Bedrock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:bedrock',
            id: BlockIdsType.Bedrock,
            hardness: -1
        });
    }

    isBreakable() {
        return false;
    }

    public getBlastResistance() {
        return 18000000;
    }
}
