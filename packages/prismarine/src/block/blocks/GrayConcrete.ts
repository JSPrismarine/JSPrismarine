import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class GrayConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:gray_concrete', ConcreteColorType.Gray);
    }
}
