import LiteralCommandNode from '../tree/LiteralCommandNode';
import ArgumentBuilder from './ArgumentBuilder';

export default class LiteralArgumentBuilder<S> extends ArgumentBuilder<S, LiteralArgumentBuilder<S>> {
    private literal: string;

    public constructor(literal: string) {
        super();
        this.literal = literal;
    }

    public static literal<S>(name: string): LiteralArgumentBuilder<S> {
        return new LiteralArgumentBuilder<S>(name);
    }

    public getThis(): LiteralArgumentBuilder<S> {
        return this;
    }

    public getLiteral(): string {
        return this.literal;
    }

    public build(): LiteralCommandNode<S> {
        let result: LiteralCommandNode<S> = new LiteralCommandNode(
            this.getLiteral(),
            this.getCommand(),
            this.getRequirement(),
            this.getRedirect(),
            this.getRedirectModifier(),
            this.isFork()
        );
        for (let arg of this.getArguments()) {
            result.addChild(arg);
        }

        return result;
    }
}

export const literal = LiteralArgumentBuilder.literal;
