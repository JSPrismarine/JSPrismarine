import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class YellowConcrete extends Concrete {
    constructor() {
        super('minecraft:yellow_concrete', ConcreteColor.Yellow);
    }
}
