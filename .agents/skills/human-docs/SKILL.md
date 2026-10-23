---
name: human-docs
description: Use when creating, editing, or reviewing human-facing documentation in this repository (README files, guides, forms, and prose sources for generated docs). Excludes agent-facing documents such as AGENTS.md, docs/agents/, and skill files, plus GLOSSARY.md.
---

# Human-facing documentation

Write as a knowledgeable colleague explaining something to another person. Help the reader understand it comfortably, with enough context to use it confidently.

## Find the reader's need

- Identify the primary reader and what they need to do, decide, predict, or diagnose.
- Open with what the reader came to learn. Develop the explanation in the order they need it, introducing prerequisites and limits where they become relevant.
- Keep context that makes the explanation understandable, including a useful example or the reason something works this way. Cut repetition and tangents; judge usefulness across the explanation rather than demanding that every sentence be an instruction.
- Keep technical detail when it changes what the reader can do, decide, expect, or diagnose. Translate it into reader terms where possible. Before removing it, check whether nearby text already covers its reader-facing consequence. Move it to a narrower document only when a reader needs it there; do not create a document as a dumping ground.
- Use plain words for narrative while keeping API names, configuration paths, commands, values, versions, and material caveats exact. Verify substantive claims against authoritative code, configuration, declarations, or source documentation when needed.
- Choose headings, lists, tables, and examples when they make a reader's task easier. Do not force a template or word limit.

## Make it pleasant to read

Use complete, connected sentences. Let each sentence build on the previous one, and give each paragraph one main idea. Explain cause and effect together: what happens, why it matters here, and what the reader can do about it.

Prefer familiar words, concrete subjects, and active verbs. Address the reader as “you” when giving instructions; use the component's name when explaining its behavior. A calm, conversational tone and ordinary contractions are welcome. Match the reader's knowledge without sounding promotional, patronizing, or artificially cheerful.

Use prose for explanations, numbered steps for a procedure, bullets for parallel items, and tables for comparisons or reference data. Preserve transitions and useful connective words when they make the explanation easier to follow. Brevity should come from removing needless content, rather than turning the remaining explanation into fragments, labels, or a dense list of facts.

Read the finished passage as if you were explaining it aloud to a colleague. Revise awkward phrasing, abrupt jumps, repeated sentence patterns, and strings of caveats. The reader should be able to follow the explanation on the first read without reconstructing missing connections.

## Work within the request

- For a requested edit, read the full document. Prune or reorder clearly redundant, stale, or implementation-only details when they undermine the reader's goal. Keep changes within the requested documents.
- For a review-only request, leave files untouched. Report material findings with their location, the reader problem, and a concise fix.
- For generated content, edit its source of truth. Inspect the affected package's `package.json` to find the generation and validation workflow instead of duplicating those steps here.
