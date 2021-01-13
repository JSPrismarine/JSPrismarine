import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class OrangeConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:orange_concrete', ConcreteColorType.Orange);
    }
}
