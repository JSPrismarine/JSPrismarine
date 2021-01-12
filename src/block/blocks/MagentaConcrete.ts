import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class MagentaConcrete extends Concrete {
    constructor() {
        super('minecraft:magenta_concrete', ConcreteColor.Magenta);
    }
}
