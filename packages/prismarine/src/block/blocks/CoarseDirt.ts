import Dirt, { DirtType } from './Dirt.js';

export default class CoarseDirt extends Dirt {
    public constructor() {
        super('minecraft:coarse_dirt', DirtType.Coarse);
    }
}
