import Leaves, { LeavesType } from './OakLeaves';
export default class JungleLeaves extends Leaves {
    public constructor() {
        super('minecraft:jungle_leaves', LeavesType.Jungle);
    }
}
