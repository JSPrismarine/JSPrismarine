import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class RedConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:red_concrete', ConcreteColorType.Red);
    }
}
