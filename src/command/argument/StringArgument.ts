import CommandExecuter from "../CommandExecuter";
import Argument from "./Argument";

export default class StringArgument extends Argument<string> {
    #extends: boolean = false;
    // whether or not the argument extends into the next one.
    public constructor(extend: boolean = false) {
        super();
        this.#extends = extend || false;
    }
    public parse(executer: CommandExecuter, arg: string, currentStack: Argument<unknown>[], strArgs: string[]) {
        if (this.#extends) {
            // consumes all other arguments!
            return strArgs.slice(0)?.join(' ') || null;
        }
        return arg; // this is a hack.
    }
}