import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class GayConcrete extends Concrete {
    constructor() {
        super('minecraft:gray_concrete', ConcreteColor.Gray);
    }
}
