import javascriptConfig from '@playcanvas/eslint-config/javascript';
import globals from 'globals';

export default [
    ...javascriptConfig,
    {
        ignores: ['dist/**']
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        rules: {
            'import/order': 'off',
            'import/no-unresolved': 'off',
            'jsdoc/require-property-description': 'off',
            'jsdoc/require-returns': 'off'
        }
    }
];
