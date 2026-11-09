<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';
import HomeLanding from './HomeLanding.vue';
import MegaNav from './MegaNav.vue';

const { Layout } = DefaultTheme;
const { frontmatter } = useData();
</script>

<template>
    <Layout>
        <template #nav-bar-content-before>
            <MegaNav />
        </template>
        <template #home-hero-before>
            <HomeLanding v-if="frontmatter.landing" />
        </template>
    </Layout>
</template>
