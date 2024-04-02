import type CommandContext from './context/CommandContext';

export default interface SingleRedirectModifier<S> {
    apply(context: CommandContext<S>): S;
}
