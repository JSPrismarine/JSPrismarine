import Leaves, { LeavesType } from './OakLeaves';
export default class JungleLeaves extends Leaves {
    constructor() {
        super('minecraft:jungle_leaves', LeavesType.Jungle);
    }
}
