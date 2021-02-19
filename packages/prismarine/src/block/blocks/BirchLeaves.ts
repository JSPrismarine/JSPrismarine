import Leaves, { LeavesType } from './OakLeaves';
export default class BirchLeaves extends Leaves {
    public constructor() {
        super('minecraft:birch_leaves', LeavesType.Birch);
    }
}
