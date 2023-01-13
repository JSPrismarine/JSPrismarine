import { BlockIdsType } from '../BlockIdsType.js';
import Transparent from '../Transparent.js';

export default class RedstoneWire extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:redstone_wire',
            id: BlockIdsType.RedstoneWire,
            hardness: 0
        });
    }
}
