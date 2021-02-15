import * as colors from './Colors';

const Parser = (str: string, prefix = '§', clearAtEnd = true) => {
    return `${str.replace(new RegExp(`\\${prefix}[\\dabcdefklmnor]`, 'gm'), (v) => {
        return colors.toConsole[v.slice(1)];
    })}${(clearAtEnd && colors.toConsole.r) || ''}`;
};

export default Parser;
