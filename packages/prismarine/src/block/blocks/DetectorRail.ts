import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Transparent from '../Transparent.js';

export default class DetectorRail extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:detector_rail',
            id: BlockIdsType.DetectorRail,
            hardness: 0.7
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
