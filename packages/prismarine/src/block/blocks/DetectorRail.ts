import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

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
