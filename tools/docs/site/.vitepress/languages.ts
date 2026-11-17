import mcfunction from './mcfunction.tmLanguage.json';
import molang from './molang.tmLanguage.json';

/**
 * Shiki ships no grammar for mcfunction or Molang, so their fences fall back to plain text; these
 * are the local ones. The site config and the search index's renderer both register them.
 */
export const languages = [mcfunction, molang];
