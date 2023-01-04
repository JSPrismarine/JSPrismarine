import Leaves, { LeavesType } from './OakLeaves.js';
export default class AcaciaLeaves extends Leaves {
    public constructor() {
        super('minecraft:acacia_leaves', LeavesType.Acacia);
    }
}
