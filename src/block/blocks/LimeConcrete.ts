import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class LimeConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:lime_concrete', ConcreteColorType.Lime);
    }
}
