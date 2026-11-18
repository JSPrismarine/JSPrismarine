import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered } from '../../../.test/javaRegistries';
import { DiagnosticCollector } from './diagnostics';
import { ParseContext } from './parse';
import { entityPredicate, itemPredicate } from './subpredicates';
import { UNHANDLED_DATA_COMPONENT_PREDICATE_TYPE, UNHANDLED_ENTITY_SUB_PREDICATE_TYPE } from './unhandledJavaTypes';

/**
 * What the dispatch reports for a type with no built-in parser: a registered type it does not
 * implement, an unknown entity sub-predicate, or a key it reads as a data component presence check.
 */
const NO_PARSER = /is not implemented|unknown entity sub-predicate type|is not a data component predicate type/;

/** Whether parsing `build`'s document for a type reached a built-in parser. */
const reachesParser =
    (build: (type: string) => (context: ParseContext) => unknown) =>
    (id: string): boolean => {
        const collector = new DiagnosticCollector();
        build(id)(new ParseContext('root', collector, undefined));
        return !collector.entries.some((entry) => NO_PARSER.test(entry.message));
    };

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a data component predicate or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:data_component_predicate_type',
            // The value needs a member: the presence check warns only when the value is not empty.
            handles: reachesParser(
                (type) => (context) => itemPredicate({ predicates: { [type]: { probe: true } } }, context)
            ),
            unhandled: UNHANDLED_DATA_COMPONENT_PREDICATE_TYPE
        });
    });

    it('has an entity sub-predicate or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:entity_sub_predicate_type',
            handles: reachesParser((type) => (context) => entityPredicate({ [type]: {} }, context)),
            unhandled: UNHANDLED_ENTITY_SUB_PREDICATE_TYPE
        });
    });
});
