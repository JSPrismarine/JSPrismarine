import { BlockIdsType } from '../BlockIdsType';
import { Solid } from '../Solid';

export default class Piston extends Solid {
    public constructor(name = 'minecraft:piston', id: BlockIdsType = BlockIdsType.Piston) {
        super({
            name,
            id,
            hardness: 1.5
        });
    }
}
