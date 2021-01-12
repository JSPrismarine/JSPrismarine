import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class LimeConcrete extends Concrete {
    constructor() {
        super('minecraft:lime_concrete', ConcreteColor.Lime);
    }
}
