import { BlockIdsType } from '../BlockIdsType';
import Transparent from '../Transparent';

export default class RedstoneWire extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:redstone_wire',
            id: BlockIdsType.RedstoneWire,
            hardness: 0
        });
    }
}
