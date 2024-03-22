import Dirt, { DirtType } from './Dirt';

export default class Podzol extends Dirt {
    public constructor() {
        super('minecraft:podzol', DirtType.Podzol);
    }
}
