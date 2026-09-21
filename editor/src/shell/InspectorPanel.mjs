import { Button, Panel, VectorInput } from '@playcanvas/pcui/react';
import { useState } from 'react';

import { getSelectedEntity, isFiniteVector3 } from '../domain/editor-reducer.mjs';
import { jsx } from '../jsx.mjs';

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void, ready: boolean, collapsed: boolean, onToggle: () => void }} props - Inspector props.
 */
export function InspectorPanel({ state, dispatch, ready, collapsed, onToggle }) {
    const entity = getSelectedEntity(state);
    const [transformExpanded, setTransformExpanded] = useState(true);

    if (collapsed) {
        return jsx(
            Panel,
            { className: 'editor-panel inspector-panel', headerText: 'Inspector' },
            jsx('div', { className: 'panel-header-actions' },
                jsx(Button, {
                    className: 'panel-action-button',
                    text: '‹',
                    tooltip: 'Expand Inspector panel',
                    onClick: onToggle
                })
            )
        );
    }

    if (!entity) {
        return jsx(
            Panel,
            { className: 'editor-panel inspector-panel', headerText: 'Inspector' },
            jsx('div', { className: 'panel-header-actions' },
                jsx(Button, {
                    className: 'panel-action-button',
                    text: '›',
                    tooltip: 'Collapse Inspector panel',
                    onClick: onToggle
                })
            ),
            jsx('p', { className: 'empty-selection' }, 'Select a scene entity to inspect its properties.')
        );
    }

    /**
     * @param {'position'|'rotation'|'scale'} field - Transform field to update.
     * @param {number[]} value - New vector.
     */
    const updateTransform = (field, value) => {
        const vector = value.map(Number);
        if (!isFiniteVector3(vector)) {
            return;
        }
        dispatch({
            type: 'setTransform',
            entityId: entity.id,
            label: `Edit ${field}`,
            transform: {
                ...entity.transform,
                [field]: vector
            }
        });
    };

    const vector = (label, field, unit) => jsx(
        'div',
        { className: 'inspector-field', key: field },
        jsx('div', { className: 'inspector-field-heading' },
            jsx('span', { className: 'inspector-label' }, label),
            jsx('span', { className: 'inspector-unit' }, unit),
            jsx(Button, {
                className: 'field-reset-button',
                text: '↺',
                tooltip: `Reset ${label}`,
                disabled: !ready,
                onClick: () => dispatch({ type: 'resetTransformField', entityId: entity.id, field })
            })
        ),
        jsx(VectorInput, {
            className: `transform-vector transform-vector-${field}`,
            dimensions: 3,
            value: entity.transform[field],
            onChange: value => updateTransform(field, value)
        })
    );

    return jsx(
        Panel,
        { className: 'editor-panel inspector-panel', headerText: 'Inspector' },
        jsx('div', { className: 'panel-header-actions' },
            jsx(Button, {
                className: 'panel-action-button',
                text: '›',
                tooltip: 'Collapse Inspector panel',
                onClick: onToggle
            })
        ),
        jsx('section', { className: 'inspector-identity' },
            jsx('div', null,
                jsx('p', { className: 'inspector-kicker' }, 'Selected Entity'),
                jsx('h2', null, entity.name)
            ),
            jsx('span', { className: 'entity-chip' }, entity.type)
        ),
        jsx('section', { className: 'inspector-section transform-section' },
            jsx('button', {
                type: 'button',
                className: 'inspector-section-toggle',
                'aria-expanded': transformExpanded,
                onClick: () => setTransformExpanded(!transformExpanded)
            }, jsx('span', null, transformExpanded ? '⌄' : '›'), ' Transform'),
            transformExpanded && jsx('div', { className: 'transform-fields' },
                vector('Location', 'position', 'cm'),
                vector('Rotation', 'rotation', '°'),
                vector('Scale', 'scale', '×')
            )
        ),
        jsx('section', { className: 'inspector-section' },
            jsx('h3', null, 'Components'),
            jsx('p', { className: 'inspector-note' }, 'Read-only summary'),
            jsx('ul', { className: 'component-list' }, ...entity.components.map(component => jsx('li', { key: component }, component)))
        )
    );
}
