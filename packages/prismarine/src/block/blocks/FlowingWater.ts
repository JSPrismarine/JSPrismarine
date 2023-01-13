import { BlockIdsType } from '../BlockIdsType.js';
import Liquid from '../Liquid.js';

export default class FlowingWater extends Liquid {
    public constructor(name = 'minecraft:flowing_water', id = BlockIdsType.FlowingWater) {
        super({
            name,
            id
        });
    }

    public getLightFilter() {
        return 2;
    }
}
