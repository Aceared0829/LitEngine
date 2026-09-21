import { createRoot } from 'react-dom/client';

import '@playcanvas/pcui/styles';

import { EditorApp } from './shell/EditorApp.mjs';
import { jsx } from './jsx.mjs';
import './styles/editor.css';

const container = document.getElementById('app');
if (container) {
    createRoot(container).render(jsx(EditorApp));
}
