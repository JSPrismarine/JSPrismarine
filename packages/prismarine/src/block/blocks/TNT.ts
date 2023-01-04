import { BlockIdsType } from '../BlockIdsType.js';
import Solid from '../Solid.js';

export default class TNT extends Solid {
    public constructor() {
        super({
            name: 'minecraft:tnt',
            id: BlockIdsType.TNT,
            hardness: 0
        });
    }
}
