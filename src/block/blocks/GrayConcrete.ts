import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class GrayConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:gray_concrete', ConcreteColorType.Gray);
    }
}
