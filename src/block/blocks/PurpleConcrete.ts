import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class PurpleConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:purple_concrete', ConcreteColorType.Purple);
    }
}
