import { BlockIdsType } from '../BlockIdsType.js';
import FlowingWater from './FlowingWater.js';

export default class Water extends FlowingWater {
    public constructor() {
        super('minecraft:water', BlockIdsType.Water);
    }
}
