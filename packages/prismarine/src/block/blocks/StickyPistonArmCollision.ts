import { BlockIdsType } from '../BlockIdsType';
import { Solid } from '../Solid';

export default class StickyPistonArmCollision extends Solid {
    public constructor(
        name = 'minecraft:sticky_piston_arm_collision', // It's actually supposed to be "stickyPistonArmCollision", but that's dumb
        id: BlockIdsType = BlockIdsType.StickyPistonArmCollision
    ) {
        super({
            name,
            id,
            hardness: 1.5
        });
    }
}
