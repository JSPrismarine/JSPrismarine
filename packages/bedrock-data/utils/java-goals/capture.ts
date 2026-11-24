import type { JavaEntityGoal, JavaGoalArgument } from '../../src/index.ts';
import type { JavaMemberRef } from '@jsprismarine/java-classfile/classFile';
import type { JavaGoal, JavaGoalReader, JavaValue } from './goals.ts';

/**
 * Turns the goals a {@link JavaGoalReader} reads out of the jar into the JSON the runtime reads
 * without the jar: `src/jsp/java/<release>/entity_goals.json`.
 *
 * Each argument is written as what it means rather than how the bytecode built it. A class
 * literal also lists every entity type whose class is, or extends, it, because a runtime cannot
 * walk a superclass chain it does not have. A predicate lambda lists the item tags and items its
 * code reads, which is how a tempt goal's items are known. Anything the walk could not resolve is
 * `null`.
 */

const simpleMember = (member: JavaMemberRef): string =>
    `${member.owner.slice(member.owner.lastIndexOf('/') + 1)}.${member.name}`;

/**
 * Builds the capture: every Java entity type that registers at least one goal, with its goals in
 * the order the walk recorded them.
 *
 * @param reader - The goal reader over the pinned jar.
 */
export const captureJavaGoals = (reader: JavaGoalReader): Record<string, readonly JavaEntityGoal[]> => {
    const types = [...reader.javaEntityClasses()].sort(([left], [right]) => left.localeCompare(right, 'en'));
    const subclasses = new Map<string, readonly string[]>();
    const entitiesOf = (className: string): readonly string[] => {
        let found = subclasses.get(className);
        if (found === undefined) {
            found = types
                .filter(([, entityClass]) => reader.javaSuperChain(entityClass).includes(className))
                .map(([javaId]) => javaId);
            subclasses.set(className, found);
        }
        return found;
    };

    const argument = (value: JavaValue | undefined, mobClass: string): JavaGoalArgument => {
        if (value === undefined) return null;
        switch (value.kind) {
            case 'number':
                // A float constant, or a double widened from one, carries float rounding, such as
                // 1.149999976158142 for 1.15F, which seven significant digits undo.
                return !Number.isInteger(value.value) && Math.fround(value.value) === value.value
                    ? Number(value.value.toPrecision(7))
                    : value.value;
            case 'string':
                return value.value;
            case 'class':
                return { class: value.name, entities: entitiesOf(value.name) };
            case 'field':
                return { field: simpleMember(value.field) };
            case 'lambda': {
                if (value.target === undefined) return { lambda: null };
                const statics = reader.javaStaticsRead(value.target, mobClass);
                const named = (owner: string): string[] => [
                    ...new Set(
                        statics
                            .filter((read) => read.owner.endsWith(`/${owner}`))
                            .map((read) => `minecraft:${read.name.toLowerCase()}`)
                    )
                ];
                const itemTags = named('ItemTags');
                const items = named('Items');
                return {
                    lambda: `${value.target.owner}.${value.target.name}`,
                    ...(itemTags.length > 0 ? { itemTags } : {}),
                    ...(items.length > 0 ? { items } : {})
                };
            }
            case 'array':
                return { array: Array.from(value.items, (item) => argument(item, mobClass)) };
            case 'call':
                return {
                    call: simpleMember(value.method),
                    args: value.args.map((arg) => argument(arg, mobClass))
                };
            case 'object':
                return { object: value.className.slice(value.className.lastIndexOf('/') + 1) };
            default:
                return null;
        }
    };

    const entry = (goal: JavaGoal, mobClass: string): JavaEntityGoal => ({
        goal: goal.goal,
        classes: goal.classes,
        selector: goal.selector,
        priority: goal.priority ?? null,
        // The mob itself, which every goal takes first, says nothing about the goal.
        params: Object.fromEntries(
            [...goal.params]
                .filter(([, value]) => value.kind !== 'self')
                .map(([name, value]) => [name, argument(value, mobClass)])
        ),
        calls: goal.calls.map((call) => ({ name: call.name, args: call.args.map((arg) => argument(arg, mobClass)) })),
        // `alertOthers` searches the mob's own class, which a runtime cannot widen to its subclasses.
        ...(goal.calls.some((call) => call.name === 'setAlertOthers') ? { selfEntities: entitiesOf(mobClass) } : {})
    });

    const capture: Record<string, readonly JavaEntityGoal[]> = {};
    for (const [javaId, entityClass] of types) {
        const goals = reader.javaGoalsOf(entityClass);
        if (goals.length > 0) capture[javaId] = goals.map((goal) => entry(goal, entityClass));
    }
    return capture;
};
