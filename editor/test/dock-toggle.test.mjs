import assert from 'node:assert/strict';
import test from 'node:test';

import { DockToggle } from '../src/shell/DockToggle.mjs';

for (const dock of ['hierarchy', 'inspector']) {
    test(`${dock} dock toggle uses the current callback across collapse and expansion`, () => {
        let collapsed = false;
        const label = dock === 'hierarchy' ? 'Scene' : 'Inspector';
        const collapseDock = () => {
            collapsed = true;
        };
        const expandDock = () => {
            collapsed = false;
        };
        for (let cycle = 0; cycle < 3; cycle++) {
            const collapse = DockToggle({ dock, collapsed, onToggle: collapseDock });
            assert.equal(collapse.type, 'button');
            assert.equal(collapse.props['aria-label'], `Collapse ${label} panel`);
            assert.equal(collapse.props['aria-expanded'], true);
            collapse.props.onClick();

            const expand = DockToggle({ dock, collapsed, onToggle: expandDock });
            assert.equal(expand.type, 'button');
            assert.equal(expand.props['aria-label'], `Expand ${label} panel`);
            assert.equal(expand.props['aria-expanded'], false);
            assert.notEqual(expand.props.children, collapse.props.children);
            expand.props.onClick();
            assert.equal(collapsed, false);
        }
    });
}
