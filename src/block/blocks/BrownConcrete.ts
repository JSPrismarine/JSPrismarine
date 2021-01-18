import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class BrownConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:brown_concrete', ConcreteColorType.Brown);
    }
}
