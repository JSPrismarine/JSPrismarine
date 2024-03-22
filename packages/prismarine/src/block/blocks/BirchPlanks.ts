import Planks, { PlanksType } from './OakPlanks';

export default class BirchPlanks extends Planks {
    public constructor() {
        super('minecraft:birch_planks', PlanksType.Birch);
    }
}
