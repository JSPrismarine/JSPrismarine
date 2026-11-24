/**
 * Java's `item_predicate` argument, which `execute if items` takes: an item id, a `#tag` or `*`,
 * then an optional list of component tests in brackets, such as
 * `minecraft:diamond_sword[damage~{damage:{min:1}}, !custom_name]`.
 *
 * In the brackets a comma joins tests that must all pass, and `|` joins alternatives of which one
 * must. A test is a component name on its own, which the stack must carry; `name=<snbt>`, which
 * its value must equal; or `name~<snbt>`, a data component predicate. A `!` in front negates it.
 *
 * Each part compiles to a `match_tool` condition through the content's loot registry, so the
 * tags and the component predicates are the ones the datapacks declare, as a loot table's are.
 */
import type { LootRegistry } from '@jsprismarine/loot';
import { NbtErrors } from '@jsprismarine/errors/nbt';
import { parseSnbt } from '@jsprismarine/nbt/snbt';
import type { NbtTag } from '@jsprismarine/nbt/tag';
import type { Predicate, ItemStack as PredicateItemStack } from '@jsprismarine/predicates';
import { namespaced } from '@jsprismarine/predicates';

import { refuse } from './support';

/** Whether a stack passes a compiled item predicate. */
export type ItemStackTest = (stack: PredicateItemStack) => boolean;

/** A tag as the JSON a datapack would have written for it. */
const jsonOf = (tag: NbtTag): unknown => {
    switch (tag.type) {
        case 'compound':
            return Object.fromEntries(Object.entries(tag.value).map(([key, entry]) => [key, jsonOf(entry)]));
        case 'list':
            return tag.value.map(jsonOf);
        case 'byte_array':
        case 'int_array':
            return [...tag.value];
        case 'long_array':
            return [...tag.value].map(Number);
        case 'long':
            return Number(tag.value);
        default:
            return tag.value;
    }
};

/** Splits text at a separator that sits outside quotes and brackets. */
const splitTopLevel = (text: string, separator: string): readonly string[] => {
    const parts: string[] = [];
    let quote: string | undefined;
    let depth = 0;
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quote !== undefined) {
            if (character === '\\') index += 1;
            else if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === '{' || character === '[') {
            depth += 1;
        } else if (character === '}' || character === ']') {
            depth -= 1;
        } else if (character === separator && depth === 0) {
            parts.push(text.slice(start, index));
            start = index + 1;
        }
    }
    parts.push(text.slice(start));
    return parts.map((part) => part.trim());
};

/** A component name, then `=` or `~` and the value when the test has one. */
const TEST = /^([a-z0-9_.:/-]+)\s*(?:([=~])(.*))?$/is;

/**
 * Compiles an `item_predicate` argument.
 *
 * @param loot - The registry whose tags and component predicates the tests read.
 * @throws {CommandSyntaxException} When the text is not an item predicate.
 */
export const parseItemPredicateArgument = (text: string, loot: LootRegistry): ItemStackTest => {
    let compiled = compiledPredicates.get(loot);
    if (compiled === undefined) {
        compiled = new Map();
        compiledPredicates.set(loot, compiled);
    }
    const cached = compiled.get(text);
    if (cached !== undefined) return cached;
    const built = compileItemPredicate(text, loot);
    compiled.set(text, built);
    return built;
};

/**
 * Each loot registry's compiled predicates, so a predicate a function runs every tick compiles
 * once, and its diagnostics land in the registry's collector once.
 */
const compiledPredicates = new WeakMap<LootRegistry, Map<string, ItemStackTest>>();

const compileItemPredicate = (text: string, loot: LootRegistry): ItemStackTest => {
    const open = text.indexOf('[');
    const head = (open < 0 ? text : text.slice(0, open)).trim();
    if (head.length === 0) refuse(`Invalid item predicate: ${text}`);
    if (open >= 0 && !text.trimEnd().endsWith(']')) refuse(`Invalid item predicate: ${text}`);

    const compile = (predicate: unknown): Predicate => {
        const before = loot.diagnostics.entries.length;
        const compiled = loot.predicate({ type: 'minecraft:match_tool', predicate }, `item_predicate/${text}`);
        // A part that does not compile reads as true, which would match every stack.
        const error = loot.diagnostics.entries.slice(before).find((entry) => entry.severity === 'error');
        if (error !== undefined) refuse(`Invalid item predicate ${text}: ${error.message}`);
        return compiled;
    };
    const run =
        (predicate: Predicate): ItemStackTest =>
        (stack) =>
            // Any set that provides `tool` does, since a `match_tool` reads nothing else.
            predicate(loot.context(undefined, { parameterSet: 'enchanted_item', parameters: { tool: stack } }));

    const item =
        head === '*'
            ? undefined
            : run(compile({ items: head.startsWith('#') ? `#${namespaced(head.slice(1))}` : namespaced(head) }));

    const testOf = (written: string): ItemStackTest => {
        const negated = written.startsWith('!');
        const match = TEST.exec(negated ? written.slice(1).trim() : written);
        if (match === null) refuse(`Invalid item predicate test: ${written}`);
        const [, name = '', operator, value = ''] = match;
        const component = namespaced(name);

        let test: ItemStackTest;
        if (operator === undefined) {
            test = (stack) => stack.components.has(component);
        } else {
            let json: unknown;
            try {
                json = jsonOf(parseSnbt(value.trim()));
            } catch (error) {
                if (error instanceof NbtErrors.SnbtSyntax) refuse(error.message);
                throw error;
            }
            test = run(compile(operator === '=' ? { components: { [name]: json } } : { predicates: { [name]: json } }));
        }
        return negated ? (stack) => !test(stack) : test;
    };

    const body =
        open < 0
            ? ''
            : text
                  .trimEnd()
                  .slice(open + 1, -1)
                  .trim();
    const clauses =
        body.length === 0
            ? []
            : splitTopLevel(body, ',').map((clause) => {
                  const alternatives = splitTopLevel(clause, '|').map(testOf);
                  return (stack: PredicateItemStack) => alternatives.some((alternative) => alternative(stack));
              });

    return (stack) => (item === undefined || item(stack)) && clauses.every((clause) => clause(stack));
};
