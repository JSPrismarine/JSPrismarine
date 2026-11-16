// The goal reader is capture-time tooling in `packages/bedrock-data/utils/`, which ships with no
// package export, so it is reached by path. The same reader writes the committed Java goal
// capture, so the parity rows and the data the server runs read the jar the same way.
import type { JavaGoalReader } from '../../bedrock-data/utils/java-goals/goals.ts';
import { createJavaGoalReader } from '../../bedrock-data/utils/java-goals/goals.ts';

import { pinnedJavaClassBytes } from './javaBytecode.ts';

/** The goal reader over the pinned Java server jar. */
const pinned: JavaGoalReader = createJavaGoalReader(pinnedJavaClassBytes);

/** A class of the pinned jar, parsed once, or undefined when the jar holds no such class. */
export const javaClass: JavaGoalReader['javaClass'] = pinned.javaClass;

/** A class and its superclasses, nearest first, as far as the pinned jar holds them. */
export const javaSuperChain: JavaGoalReader['javaSuperChain'] = pinned.javaSuperChain;

/** The class a Java entity type constructs in the pinned jar. */
export const javaEntityClass: JavaGoalReader['javaEntityClass'] = pinned.javaEntityClass;

/** Every goal a Java mob class registers in the pinned jar, with its arguments. */
export const javaGoalsOf: JavaGoalReader['javaGoalsOf'] = pinned.javaGoalsOf;

/** The static fields a method of the pinned jar reads, following calls into the receiver's own methods. */
export const javaStaticsRead: JavaGoalReader['javaStaticsRead'] = pinned.javaStaticsRead;

/** The numeric constants a method of the pinned jar loads, in order. */
export const javaMethodNumbers: JavaGoalReader['javaMethodNumbers'] = pinned.javaMethodNumbers;
