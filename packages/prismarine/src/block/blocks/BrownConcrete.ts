import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class BrownConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:brown_concrete', ConcreteColorType.Brown);
    }
}
