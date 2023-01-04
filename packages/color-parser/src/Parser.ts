import * as colors from './Colors.js';

const Parser = (str: string, prefix = '§', clearAtEnd = true) =>
    `${str.replace(new RegExp(`\\${prefix}[\\dabcdefklmnor]`, 'gm'), (v) => {
        return colors.toConsole[v.slice(1)] as string;
    })}${(clearAtEnd && colors.toConsole.r) || ''}`;

export default Parser;
