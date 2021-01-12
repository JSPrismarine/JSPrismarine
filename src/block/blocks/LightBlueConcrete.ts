import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class lightBlueConcrete extends Concrete {
    constructor() {
        super('minecraft:light_blue_concrete', ConcreteColor.lightBlue);
    }
}
