import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class LightGayConcrete extends Concrete {
    constructor() {
        super('minecraft:light_gray_concrete', ConcreteColor.LightGray);
    }
}
