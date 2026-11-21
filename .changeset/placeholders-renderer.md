---
'@jsprismarine/script-host': minor
'@jsprismarine/script-types': minor
---

`placeholders` in `@jsprismarine/server` renders templates. `placeholders.parse(shorthand)` turns `{player:name} &7{player:ping}ms` into a rawtext-style tree, and `placeholders.render(template, player?)` renders a tree or a shorthand string to text, with the tick an animation in it next changes the text. Besides `text` and `placeholder`, a tree holds `if` nodes with a condition over placeholders and literals, `animate` nodes with frames and an interval in ticks, `gradient` nodes that color each character with the nearest `§` color, and rawtext's `translate`, `score` and `selector`. `@jsprismarine/script-types` declares `Template`, `TemplateNode` and `RenderedTemplate`.
