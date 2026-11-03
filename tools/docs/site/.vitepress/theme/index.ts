import DefaultTheme from 'vitepress/theme';

import ParityTracker from './ParityTracker.vue';

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component('ParityTracker', ParityTracker);
    }
};
