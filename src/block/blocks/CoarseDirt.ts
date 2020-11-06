import Dirt, {DirtType} from './Dirt';

export default class CoarseDirt extends Dirt {
    constructor() {
        super('minecraft:coarse_dirt', DirtType.Coarse);
    }
}
