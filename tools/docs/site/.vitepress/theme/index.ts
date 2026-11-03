import DefaultTheme from 'vitepress/theme';

import './brand.css';
import ParityTracker from './ParityTracker.vue';

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component('ParityTracker', ParityTracker);
    }
};
