import { Button, Panel } from '@playcanvas/pcui/react';
import { useRef, useState } from 'react';

import { getSelectedEntity, isFiniteVector3 } from '../domain/editor-reducer.mjs';
import { jsx } from '../jsx.mjs';
import { NumberField } from './NumberField.mjs';

/**
 * @param {{ state: import('../domain/editor-reducer.mjs').EditorState, dispatch: (command: import('../contracts/editor-contracts.mjs').EditorCommand) => void, ready: boolean, collapsed: boolean }} props - Inspector props.
 */
export function InspectorPanel({ state, dispatch, ready, collapsed }) {
    const entity = getSelectedEntity(state);
    const [transformExpanded, setTransformExpanded] = useState(true);
    const selectionRef = useRef(null);
    const transformRef = useRef(null);
    selectionRef.current = entity?.id ?? null;
    transformRef.current = entity?.transform ?? null;

    if (collapsed) {
        return jsx(Panel, { class: ['editor-panel', 'inspector-panel'], headerText: 'Inspector' });
    }

    if (!entity) {
        return jsx(
            Panel,
            { class: ['editor-panel', 'inspector-panel'], headerText: 'Inspector' },
            jsx('p', { className: 'empty-selection' }, 'Select a scene entity to inspect its properties.')
        );
    }

    /**
     * @param {string} entityId - Entity being edited.
     * @param {'position'|'rotation'|'scale'} field - Transform field to update.
     * @param {number[]} value - New vector.
     */
    const updateTransform = (entityId, field, value) => {
        const current = transformRef.current;
        const vector = value.map(Number);
        if (selectionRef.current !== entityId || !current || !isFiniteVector3(vector) ||
            vector.every((component, index) => component === current[field][index])) {
            return;
        }
        const transform = { ...current, [field]: vector };
        transformRef.current = transform;
        dispatch({
            type: 'setTransform',
            entityId,
            label: `Edit ${field}`,
            transform
        });
    };

    const vector = (label, field, unit) => jsx(
        'div',
        { className: 'inspector-field', key: field },
        jsx('div', { className: 'inspector-field-heading' },
            jsx('span', { className: 'inspector-label' }, label),
            jsx('span', { className: 'inspector-unit' }, unit),
            jsx(Button, {
                class: 'field-reset-button',
                text: '↺',
                tooltip: `Reset ${label}`,
                disabled: !ready,
                onClick: () => {
                    if (selectionRef.current) {
                        dispatch({ type: 'resetTransformField', entityId: selectionRef.current, field });
                    }
                }
            })
        ),
        jsx('div', { className: `transform-vector transform-vector-${field}`, key: entity.id },
            ...entity.transform[field].map((value, index) => jsx('div', { className: 'pcui-numeric-input', key: index },
                jsx(NumberField, {
                    value,
                    label: `${label} ${'XYZ'[index]}`,
                    onCommit: (component) => {
                        const vector = transformRef.current[field].slice();
                        vector[index] = component;
                        updateTransform(entity.id, field, vector);
                    }
                })
            ))
        )
    );

    return jsx(
        Panel,
        { class: ['editor-panel', 'inspector-panel'], headerText: 'Inspector' },
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
