import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class Bedrock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:structure_block',
            id: BlockIdsType.StructureBlock,
            hardness: -1
        });
    }

    public isBreakable() {
        return false;
    }

    public getBlastResistance() {
        return 18000000;
    }
}
