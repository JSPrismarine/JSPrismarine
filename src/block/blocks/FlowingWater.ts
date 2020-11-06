import Liquid from '../Liquid';
import { BlockIdsType } from '../BlockIdsType';

export default class FlowingWater extends Liquid {
    constructor(
        name = 'minecraft:flowing_water',
        id = BlockIdsType.FlowingWater
    ) {
        super({
            name,
            id
        });
    }

    getLightFilter() {
        return 2;
    }
}
