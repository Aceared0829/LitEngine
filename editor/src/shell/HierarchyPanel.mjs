import { Button, Panel, TextInput } from '@playcanvas/pcui/react';
import { useMemo, useState } from 'react';

import { jsx } from '../jsx.mjs';

/**
 * @param {string} value - Text being searched.
 * @param {string} query - Raw search query.
 * @returns {boolean} Whether each literal query term appears in order.
 */
const matchesQuery = (value, query) => {
    const normalized = value.toLocaleLowerCase();
    return query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(term => normalized.includes(term));
};

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void, ready: boolean, collapsed: boolean, onToggle: () => void }} props - Scene list props.
 */
export function HierarchyPanel({ state, dispatch, ready, collapsed, onToggle }) {
    const [query, setQuery] = useState('');
    const entities = useMemo(() => {
        return state.scene.entities.filter(entity => matchesQuery(`${entity.name} ${entity.type} ${entity.components.join(' ')}`, query));
    }, [query, state.scene.entities]);

    return jsx(
        Panel,
        { class: ['editor-panel', 'hierarchy-panel'], headerText: collapsed ? 'Scene' : 'Scene Outliner' },
        jsx('div', { className: 'panel-header-actions' },
            jsx(Button, {
                class: 'panel-action-button',
                text: collapsed ? '›' : '‹',
                tooltip: collapsed ? 'Expand Scene panel' : 'Collapse Scene panel',
                onClick: onToggle
            })
        ),
        !collapsed && jsx('div', { className: 'scene-panel-content' },
            jsx('div', { className: 'scene-search' },
                jsx(TextInput, {
                    value: query,
                    placeholder: 'Search scene…',
                    onChange: setQuery
                }),
                query && jsx(Button, {
                    class: 'scene-search-clear',
                    text: '×',
                    tooltip: 'Clear scene search',
                    onClick: () => setQuery('')
                })
            ),
            jsx('div', { className: 'scene-summary' }, `${entities.length} of ${state.scene.entities.length} entities`),
            jsx(
                'div',
                {
                    className: 'hierarchy-list',
                    role: 'listbox',
                    'aria-label': 'Scene entities',
                    onKeyDown: (event) => {
                        const current = entities.findIndex(entity => entity.id === state.selectedEntityId);
                        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
                            return;
                        }
                        event.preventDefault();
                        const next = event.key === 'ArrowDown' ? Math.min(current + 1, entities.length - 1) : Math.max(current - 1, 0);
                        if (entities[next]) {
                            dispatch({ type: 'selectEntity', entityId: entities[next].id });
                        }
                    }
                },
                ...entities.map(entity => jsx(
                    'button',
                    {
                        key: entity.id,
                        type: 'button',
                        className: `hierarchy-item ${state.selectedEntityId === entity.id ? 'is-selected' : ''}`,
                        role: 'option',
                        'aria-selected': state.selectedEntityId === entity.id,
                        disabled: !ready,
                        onClick: () => dispatch({ type: 'selectEntity', entityId: entity.id })
                    },
                    jsx('span', { className: `entity-icon entity-icon-${entity.components.includes('light') ? 'light' : 'mesh'}`, 'aria-hidden': true }, entity.components.includes('light') ? '☼' : '◇'),
                    jsx('span', { className: 'entity-name' }, entity.name),
                    jsx('span', { className: 'entity-type' }, entity.type)
                )),
                entities.length === 0 && jsx('p', { className: 'scene-empty' }, 'No matching scene entities.')
            )
        )
    );
}
