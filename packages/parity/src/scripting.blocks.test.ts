// @module-tag integration

import { FAMILIES } from './families.ts';
import { describeScriptingFamily } from './scripting/describeScriptingFamily.ts';

describeScriptingFamily(FAMILIES.scriptingBlocks, import.meta.filename);
