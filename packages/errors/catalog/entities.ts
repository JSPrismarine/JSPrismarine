import { defineErrors } from './defineErrors';

/** The errors `@jsprismarine/entities` throws. */
export const EntitiesErrors = defineErrors('entities', {
    /** An entity component registered its state twice. Each component declares its state once. */
    DeclaresItsComponentStateTwice: '{component} declares its component state twice'
});
