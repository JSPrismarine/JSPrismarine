import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class TNT extends Solid {
    public constructor() {
        super({
            name: 'minecraft:tnt',
            id: BlockIdsType.TNT,
            hardness: 0
        });
    }
}
