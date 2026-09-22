import { jsx } from '../jsx.mjs';

/**
 * A dock-owned toggle stays accessible when the panel content is hidden or scrolled.
 *
 * @param {{ dock: 'hierarchy'|'inspector', collapsed: boolean, onToggle: () => void }} props - Dock state.
 */
export function DockToggle({ dock, collapsed, onToggle }) {
    const label = dock === 'hierarchy' ? 'Scene' : 'Inspector';
    const pointsRight = dock === 'hierarchy' ? collapsed : !collapsed;
    return jsx('button', {
        type: 'button',
        className: 'dock-toggle',
        'aria-label': `${collapsed ? 'Expand' : 'Collapse'} ${label} panel`,
        'aria-expanded': !collapsed,
        title: `${collapsed ? 'Expand' : 'Collapse'} ${label} panel`,
        onClick: onToggle
    }, pointsRight ? '›' : '‹');
}
