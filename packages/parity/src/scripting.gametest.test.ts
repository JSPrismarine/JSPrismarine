import { FAMILIES } from './families.ts';
import { describeScriptingFamily } from './scripting/describeScriptingFamily.ts';

describeScriptingFamily(FAMILIES.scriptingGametest, import.meta.filename);
