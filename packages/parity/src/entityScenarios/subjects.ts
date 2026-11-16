import { normalizedItemIdentifier } from '@jsprismarine/entities/components/shared';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { entitiesTable } from '@jsprismarine/mapping/tables';

import { isRecord } from '../isRecord.ts';
import { serverContent } from '../serverStack.ts';

/**
 * The subjects the `entities.behavior` scenarios run over, and the readers they share for the
 * server's entity definitions.
 */

/** A Java entity type paired with the Bedrock identity the server runs it as. */
export interface EntitySubject {
    readonly javaId: string;
    readonly bedrock: string;
    /** The Java item or entity-type tag this scenario compares, or another label the scenario keys on. */
    readonly tag?: string;
}

/** One field of a parsed JSON object, or undefined when the value is not an object. */
export const field = (value: unknown, name: string): unknown => (isRecord(value) ? value[name] : undefined);

/** A string or an array of strings, as Bedrock definitions write a list of names, as a list. */
export const stringList = (value: unknown): readonly string[] =>
    typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === 'string')
          : [];

/** An item name from a Bedrock definition as the server compares it: namespaced, with a legacy name replaced by the current one. */
export const withNamespace = (identifier: string): string => normalizedItemIdentifier(identifier);

/** The body of a Bedrock entity definition: its `components` and `component_groups`. */
const definitionBody = (bedrock: string): unknown => {
    const data = serverContent().definitions.entities.get(bedrock)?.data;
    const entity = field(field(data, 'minecraft:entity'), 'minecraft:entity');
    return isRecord(entity) ? entity : field(data, 'minecraft:entity');
};

/** Every value a Bedrock entity definition gives one component, in its base components and each component group. */
export const componentValues = (bedrock: string, component: string): readonly unknown[] => {
    const body = definitionBody(bedrock);
    const found: unknown[] = [];
    const base = field(field(body, 'components'), component);
    if (base !== undefined) found.push(base);
    const groups = field(body, 'component_groups');
    if (isRecord(groups)) {
        for (const group of Object.values(groups)) {
            const value = field(group, component);
            if (value !== undefined) found.push(value);
        }
    }
    return found;
};

/** The Java entity type as the server runs it, or undefined when it maps to no Bedrock actor. */
export const mappedEntity = (javaId: string, tag?: string): EntitySubject | undefined => {
    const mapping = javaEntityTypeToBedrock(javaId);
    return mapping.kind === 'mapped'
        ? { javaId, bedrock: mapping.bedrock, ...(tag === undefined ? {} : { tag }) }
        : undefined;
};

/** Every Java entity type, sorted, which is the universe the family accounts for. */
export const javaEntityIds = (): readonly string[] =>
    Object.keys(entitiesTable.entities).sort((left, right) => left.localeCompare(right, 'en'));

/**
 * Every Java entity type whose server definition declares `component`, in its base components or
 * a component group, as a subject. This is the subject list for a scenario that compares what one
 * component does for every mob that has it.
 */
export const entitiesDeclaring = (component: string): readonly EntitySubject[] =>
    javaEntityIds().flatMap((javaId) => {
        const subject = mappedEntity(javaId);
        if (subject === undefined) return [];
        const declared = serverContent().entities.registry.get(subject.bedrock)?.declaredComponents ?? [];
        return declared.includes(component) ? [subject] : [];
    });

/** The component groups of a Bedrock entity definition that declare `component`. */
export const groupsDeclaring = (bedrock: string, component: string): readonly string[] => {
    const groups = field(definitionBody(bedrock), 'component_groups');
    if (!isRecord(groups)) return [];
    return Object.entries(groups).flatMap(([name, group]) => (field(group, component) === undefined ? [] : [name]));
};
