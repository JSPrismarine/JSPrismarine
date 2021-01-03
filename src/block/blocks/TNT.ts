import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';

export default class TNT extends Solid {
    constructor() {
        super({
            name: 'minecraft:tnt',
            id: BlockIdsType.TNT,
            hardness: 0
        });
    }
}
