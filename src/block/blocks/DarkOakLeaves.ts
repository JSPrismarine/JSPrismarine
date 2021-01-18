import Leaves, { LeavesType } from './OakLeaves';
export default class DarkOakLeaves extends Leaves {
    public constructor() {
        super('minecraft:dark_oak_leaves', LeavesType.DarkOak);
    }
}
