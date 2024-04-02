import { BlockIdsType } from '../BlockIdsType';
import { Liquid } from '../Liquid';

export default class FlowingLava extends Liquid {
    public constructor(name = 'minecraft:flowing_lava', id = BlockIdsType.FlowingLava) {
        super({
            name,
            id
        });
    }
}
