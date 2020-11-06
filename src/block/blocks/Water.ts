import FlowingWater from './FlowingWater';
import {BlockIdsType} from '../BlockIdsType';

export default class Water extends FlowingWater {
    constructor() {
        super('minecraft:water', BlockIdsType.Water);
    }
}
