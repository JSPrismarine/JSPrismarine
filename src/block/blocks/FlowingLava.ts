import Liquid from '../Liquid';
import { BlockIdsType } from '../BlockIdsType';

export default class FlowingLava extends Liquid {
    constructor(
        name = 'minecraft:flowing_lava',
        id = BlockIdsType.FlowingLava
    ) {
        super({
            name,
            id
        });
    }
}
