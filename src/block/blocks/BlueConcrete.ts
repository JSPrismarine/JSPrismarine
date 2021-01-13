import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class BlueConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:blue_concrete', ConcreteColorType.Blue);
    }
}
