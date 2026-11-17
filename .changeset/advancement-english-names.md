---
'@jsprismarine/prismarine': patch
---

Name a completed advancement in chat by its English title, such as "Stone Age", instead of its Java translation key. A Bedrock client has no string for `advancements.story.mine_stone.title`, so the server reads the text from the Java strings `ensure:worldgen` extracts into the cache, or from the file `JSP_JAVA_LANG` names. Without them it still sends the key.
