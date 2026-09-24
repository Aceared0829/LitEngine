import type { AnimTrack, Entity, GltfExporter } from '../../build/playcanvas.js';

declare const exporter: GltfExporter;
declare const root: Entity;
declare const track: AnimTrack;

const glb: Promise<ArrayBuffer> = exporter.build(root, { animations: [track] });
exporter.build(root, { coordinateSystem: 'legacy', animations: [] });

// @ts-expect-error Animation entries must be AnimTrack values.
exporter.build(root, { animations: [{}] });

void glb;
