import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class BrownConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:brown_concrete', ConcreteColorType.Brown);
    }
}
