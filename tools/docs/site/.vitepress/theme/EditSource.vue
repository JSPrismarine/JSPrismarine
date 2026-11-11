<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';

/** The page's repository source, which the site config stores in front matter as `editSource`. */
interface EditSource {
    kind: 'file' | 'folder';
    url: string;
}

const { frontmatter } = useData();
/** `editLink: false` in front matter drops the link, as it does VitePress's own edit link. */
const source = computed((): EditSource | undefined =>
    frontmatter.value.editLink === false ? undefined : frontmatter.value.editSource
);
</script>

<template>
    <p v-if="source" class="edit-source">
        <a :href="source.url">{{
            source.kind === 'file' ? 'Edit this page on GitHub' : 'View the source on GitHub'
        }}</a>
    </p>
</template>

<style scoped>
.edit-source {
    margin: 48px 0 16px;
    font-size: 14px;
    font-weight: 700;
}

.edit-source a {
    color: var(--vp-c-brand-1);
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
}
</style>
