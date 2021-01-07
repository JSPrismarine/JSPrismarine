import { BlockIdsType } from '../BlockIdsType';
import Liquid from '../Liquid';

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
