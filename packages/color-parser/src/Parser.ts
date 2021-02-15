import * as colors from './Colors';

const Parser = (str: string, prefix: string = '§', clearAtEnd: boolean = true) => {
    let resultText = str.replace(new RegExp(`\\${prefix}[\\dabcdefklmnor]`, 'gm'), (v) => {
        return colors.toConsole[v.slice(1)];
    });

    return `${resultText}${(clearAtEnd && colors.toConsole.r) || ''}`;
};

export default Parser;
