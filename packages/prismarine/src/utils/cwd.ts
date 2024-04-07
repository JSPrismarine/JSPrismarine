import process from 'node:process';
import path from 'node:path';

export const cwd = () => {
    if (process.env.JSP_DIR) return path.join(process.cwd(), process.env.JSP_DIR);
    else return process.cwd();
};
