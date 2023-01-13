import { BlockIdsType } from '../BlockIdsType.js';
import FlowingLava from './FlowingLava.js';

export default class Lava extends FlowingLava {
    public constructor() {
        super('minecraft:lava', BlockIdsType.Lava);
    }
}
