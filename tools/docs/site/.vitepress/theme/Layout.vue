<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import MegaNav from './MegaNav.vue';

const { Layout } = DefaultTheme;
</script>

<template>
    <Layout>
        <template #nav-bar-content-before>
            <MegaNav />
        </template>
    </Layout>
</template>
