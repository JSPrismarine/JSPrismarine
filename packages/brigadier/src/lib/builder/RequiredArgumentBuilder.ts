import ArgumentType from '../arguments/ArgumentType';
import SuggestionProvider from '../suggestion/SuggestionProvider';
import ArgumentCommandNode from '../tree/ArgumentCommandNode';
import ArgumentBuilder from './ArgumentBuilder';

export default class RequiredArgumentBuilder<S, T> extends ArgumentBuilder<S, RequiredArgumentBuilder<S, T>> {
    private name: string;
    private type: ArgumentType<T>;
    private suggestionsProvider!: SuggestionProvider<S>;

    private constructor(name: string, type: ArgumentType<T>) {
        super();
        this.name = name;
        this.type = type;
    }

    public static argument<S, T>(name: string, type: ArgumentType<T>) {
        return new RequiredArgumentBuilder(name, type);
    }

    public suggests(provider: SuggestionProvider<S>) {
        this.suggestionsProvider = provider;
        return this.getThis();
    }

    public getSuggestionsProvider(): SuggestionProvider<S> {
        return this.suggestionsProvider;
    }

    public getThis(): RequiredArgumentBuilder<S, T> {
        return this;
    }

    public getType(): ArgumentType<T> {
        return this.type;
    }

    public getName(): string {
        return this.name;
    }

    public build(): ArgumentCommandNode<S, T> {
        let result: ArgumentCommandNode<S, T> = new ArgumentCommandNode(
            this.getName(),
            this.getType(),
            this.getCommand(),
            this.getRequirement(),
            this.getRedirect(),
            this.getRedirectModifier(),
            this.isFork(),
            this.getSuggestionsProvider()
        );
        for (let arg of this.getArguments()) {
            result.addChild(arg);
        }
        return result;
    }
}

export const argument = RequiredArgumentBuilder.argument;
