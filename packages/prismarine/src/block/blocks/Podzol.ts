import Dirt, { DirtType } from './Dirt';

export default class Podzol extends Dirt {
    constructor() {
        super('minecraft:podzol', DirtType.Podzol);
    }
}
