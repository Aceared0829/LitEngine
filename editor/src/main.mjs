import { createRoot } from 'react-dom/client';

import '@playcanvas/pcui/styles';

import { EditorApp } from './shell/EditorApp.mjs';
import { PopoutPanel } from './shell/PopoutPanel.mjs';
import { PopoutGroup } from './shell/PopoutGroup.mjs';
import { jsx } from './jsx.mjs';
import './styles/editor.css';

const container = document.getElementById('app');
if (container) {
    const panel = new URLSearchParams(globalThis.location.search).get('panel');
    const floating = new URLSearchParams(globalThis.location.search).get('floating');
    createRoot(container).render(floating ? jsx(PopoutGroup, { id: floating }) :
        panel === 'hierarchy' || panel === 'inspector' ? jsx(PopoutPanel, { id: panel }) : jsx(EditorApp));
}
