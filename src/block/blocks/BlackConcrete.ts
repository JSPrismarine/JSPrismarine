import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class BlackConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:black_concrete', ConcreteColorType.Black);
    }
}
