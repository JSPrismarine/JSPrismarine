import CommandDispatcher from './CommandDispatcher';
import LiteralMessage from './LiteralMessage';
import ParseResults from './ParseResults';
import StringReader from './StringReader';
import { DefaultType } from './arguments/ArgumentType';
import BoolArgumentType from './arguments/BoolArgumentType';
import FloatArgumentType from './arguments/FloatArgumentType';
import IntegerArgumentType from './arguments/IntegerArgumentType';
import StringArgumentType, { StringType } from './arguments/StringArgumentType';
import LiteralArgumentBuilder, { literal } from './builder/LiteralArgumentBuilder';
import RequiredArgumentBuilder, { argument } from './builder/RequiredArgumentBuilder';
import CommandContext from './context/CommandContext';
import CommandContextBuilder from './context/CommandContextBuilder';
import ParsedArgument from './context/ParsedArgument';
import ParsedCommandNode from './context/ParsedCommandNode';
import StringRange from './context/StringRange';
import SuggestionsContext from './context/SuggestionContext';
import CommandSyntaxException from './exceptions/CommandSyntaxException';
import { DynamicCommandExceptionType } from './exceptions/DynamicCommandExceptionType';
import { SimpleCommandExceptionType } from './exceptions/SimpleCommandExceptionType';
import Suggestion from './suggestion/Suggestion';
import Suggestions from './suggestion/Suggestions';
import SuggestionsBuilder from './suggestion/SuggestionsBuilder';
import ArgumentCommandNode from './tree/ArgumentCommandNode';
import LiteralCommandNode from './tree/LiteralCommandNode';
import RootCommandNode from './tree/RootCommandNode';

const { word, string, greedyString, bool, integer, float } = DefaultType;

export {
    ArgumentCommandNode,
    BoolArgumentType,
    CommandContext,
    CommandContextBuilder,
    CommandDispatcher,
    CommandSyntaxException,
    DynamicCommandExceptionType,
    FloatArgumentType,
    IntegerArgumentType,
    LiteralArgumentBuilder,
    LiteralCommandNode,
    LiteralMessage,
    ParseResults,
    ParsedArgument,
    ParsedCommandNode,
    RequiredArgumentBuilder,
    RootCommandNode,
    SimpleCommandExceptionType,
    StringArgumentType,
    StringRange,
    StringReader,
    StringType,
    Suggestion,
    Suggestions,
    SuggestionsBuilder,
    SuggestionsContext,
    argument,
    bool,
    float,
    greedyString,
    integer,
    literal,
    string,
    word
};

export type { default as ArgumentType } from './arguments/ArgumentType';
export type { ArgumentParseContext } from './arguments/ArgumentType';
