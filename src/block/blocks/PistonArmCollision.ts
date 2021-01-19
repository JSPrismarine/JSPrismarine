import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class PistonArmCollision extends Solid {
    public constructor(
        name = 'minecraft:piston_arm_collision', // It's actually supposed to be "pistonArmCollision", but that's dumb
        id: BlockIdsType = BlockIdsType.PistonArmCollision
    ) {
        super({
            name,
            id,
            hardness: 1.5
        });
    }
}
