import { FAMILIES } from './families.ts';
import { describeScriptingFamily } from './scripting/describeScriptingFamily.ts';

describeScriptingFamily(FAMILIES.scriptingUi, import.meta.filename);
