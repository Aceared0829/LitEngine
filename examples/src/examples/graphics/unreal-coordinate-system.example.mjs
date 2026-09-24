// @config

import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    Color,
    ELEMENTTYPE_IMAGE,
    ElementComponentSystem,
    Entity,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    ScreenComponentSystem,
    StandardMaterial,
    Vec3,
    Vec2,
    Vec4,
    createGraphicsDevice
} from 'playcanvas';

import { deviceType } from 'examples/context';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('application-canvas'));
window.focus();

const device = await createGraphicsDevice(canvas, { deviceTypes: [deviceType] });
const options = new AppOptions();
options.graphicsDevice = device;
options.componentSystems = [
    RenderComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    ScreenComponentSystem,
    ElementComponentSystem
];

const app = new AppBase(canvas);
app.init(options);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
app.scene.ambientLight = new Color(0.2, 0.2, 0.2);

const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => window.removeEventListener('resize', resize));
app.start();

const makeMaterial = (color) => {
    const material = new StandardMaterial();
    material.diffuse = color;
    material.update();
    return material;
};

const createPrimitive = (name, type, position, scale, color) => {
    const entity = new Entity(name, app);
    entity.addComponent('render', { type, material: makeMaterial(color) });
    entity.setLocalPosition(position);
    entity.setLocalScale(scale);
    app.root.addChild(entity);
    return entity;
};

// Unreal uses +X forward, +Y right, +Z up. The converted plane primitive faces +Z.
createPrimitive('XY Ground', 'plane', new Vec3(0, 0, -5), new Vec3(1200, 1200, 1), new Color(0.18, 0.2, 0.23));

const box = createPrimitive('Rotating Box', 'box', new Vec3(0, 0, 80), new Vec3(120, 90, 160), new Color(0.15, 0.58, 0.95));
createPrimitive('Z-aligned Cone', 'cone', new Vec3(220, 100, 75), new Vec3(90, 90, 150), new Color(0.95, 0.62, 0.2));
createPrimitive('Z-aligned Capsule', 'capsule', new Vec3(-220, -100, 100), new Vec3(80, 80, 200), new Color(0.48, 0.42, 0.9));

const camera = new Entity('Camera', app);
camera.addComponent('camera', {
    clearColor: new Color(0.055, 0.065, 0.08),
    farClip: 5000,
    fov: 55,
    priority: 0,
    rect: new Vec4(0, 0, 0.5, 1)
});
camera.setLocalPosition(650, -850, 560);
camera.lookAt(Vec3.ZERO);
app.root.addChild(camera);

// Render the same Unreal-space scene through a second camera in the right viewport. The opposing
// view catches per-camera forward/up assumptions that a single-camera smoke test cannot expose.
const oppositeCamera = new Entity('Opposite Camera', app);
oppositeCamera.addComponent('camera', {
    clearColor: new Color(0.045, 0.055, 0.07),
    farClip: 5000,
    fov: 55,
    priority: 1,
    rect: new Vec4(0.5, 0, 0.5, 1)
});
oppositeCamera.setLocalPosition(-650, 850, 560);
oppositeCamera.lookAt(Vec3.ZERO);
app.root.addChild(oppositeCamera);

// Show a small world-space UI panel. Its edge colors visualize the screen's local +Y horizontal
// axis and +Z up axis, and exercise the Unreal world-Screen plane mapping on both backends.
const screenPosition = new Vec3(-250, 250, 240);
const screen = new Entity('Unreal World Screen', app);
screen.setPosition(screenPosition);
screen.lookAt(camera.getPosition());
screen.setLocalScale(1.2, 1.2, 1.2);
screen.addComponent('screen', {
    resolution: new Vec2(260, 170),
    screenSpace: false
});
app.root.addChild(screen);

const addScreenMarker = (name, x, y, width, height, color) => {
    const marker = new Entity(name, app);
    marker.addComponent('element', {
        type: ELEMENTTYPE_IMAGE,
        anchor: new Vec4(0.5, 0.5, 0.5, 0.5),
        pivot: new Vec2(0.5, 0.5),
        width,
        height,
        color
    });
    screen.addChild(marker);
    marker.setLocalPosition(x, y, 0);
};

addScreenMarker('Screen panel', 0, 0, 260, 170, new Color(0.07, 0.09, 0.13));
addScreenMarker('Screen top +Z', 0, -76, 230, 18, new Color(0.2, 0.9, 1));
addScreenMarker('Screen bottom -Z', 0, 76, 230, 18, new Color(1, 0.58, 0.22));
addScreenMarker('Screen left -Y', -116, 0, 18, 126, new Color(0.85, 0.35, 1));
addScreenMarker('Screen right +Y', 116, 0, 18, 126, new Color(0.38, 1, 0.38));

const light = new Entity('Directional Light', app);
light.addComponent('light', { type: 'directional', intensity: 1.4, castShadows: true });
light.setLocalEulerAngles(0, -35, -35); // Roll, Pitch, Yaw: point the +X emission direction down onto the scene.
app.root.addChild(light);

const rotation = new Vec3(0, 0, 0);
app.on('update', (dt) => {
    rotation.z = (rotation.z + dt * 35) % 360;
    box.setLocalEulerAngles(rotation);
});
