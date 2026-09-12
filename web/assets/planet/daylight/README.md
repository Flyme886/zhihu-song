# Daylight: original GLB miniatures

These are original, locally authored procedural 3D assets for this project. The
models, topology, colors, details and animations are defined in `generate.mjs`.
No online models, character meshes, photographs, textures, or reference asset
packs were downloaded. Geometry is generated with Three.js 0.180.0 and exported
to self-contained binary glTF 2.0. All assets have zero external resources.

The traveler wears a warm ivory jacket with lapels, stitching and pockets, navy
trousers, leather shoes with laces, and an ochre canvas backpack with buckles.
The imagined classical bust has carved eyes, lids, lips, nose, ears, curls,
clavicles, drapery, shoulders and a turned socle. The environment also includes
a slatted wood-and-iron bench, a postcard wayfinding sign, and a limestone plinth.

## Files and generation

From the repository root, with the existing pinned `web/node_modules/three`:

```sh
node web/assets/planet/daylight/generate.mjs
```

This deterministically overwrites only `traveler.glb`, `environment.glb` and
`validation.json` in this folder. It exports both assets, reads them back using
the actual vendored GLTFLoader, checks required nodes and clips, checks all
geometry attributes and sampled transforms for finite numbers, and writes the
mesh/triangle/material/bounds report. It does not modify the application.

| Asset | Meshes | Triangles | Notes |
| --- | ---: | ---: | --- |
| `traveler.glb` | 16 | 31,980 | 3 materials, 5 animation clips |
| `environment.glb` | 10 | 36,060 | Bench 3, sign 2, plinth 2, bust 3 |

Original part colors are baked into linear vertex colors before combining
geometry by the nearest animated joint and material roughness/metalness.
Thus visual detail is retained while draw calls are small. Materials remain
standard physically lit Three.js materials; there are no textures or shaders
to download. Each merged mesh records its original part names in
`userData.sourceParts`.

## Coordinate and node contract

Units are meters; `+Y` is up and `+Z` is forward. The traveler stands about
1.74 m above its root origin, with the soles about 0.014 m above it. Place the
loaded scene inside a world-placement group. `avatar` is the animated local
root, so its small vertical clip offsets should not replace world placement.

These are regular named transform groups and rigid geometry, not a skinned
mesh or a bone skeleton. They can be cloned with `clone(true)` and manipulated
through `getObjectByName`. Stop the AnimationMixer before overriding the same
joint rotations from application code.

```text
avatar
├── torso                   hip/waist pivot, y = 0.92
│   ├── head                base-of-head pivot
│   ├── armL                character left, x > 0, shoulder pivot
│   │   └── forearmL        elbow pivot
│   ├── armR                character right, x < 0, shoulder pivot
│   │   └── forearmR        elbow pivot
│   ├── backpack
│   └── book                default scale = 0, read clip sets scale = 1
├── legL                    hip pivot, y = 0.907
│   └── shinL               knee pivot, 0.405 below the hip
└── legR
    └── shinR
```

The clips `idle`, `walk`, `run`, `sit`, and `read` are each 2 seconds long,
looping in place. `sit` lowers the avatar by 0.395 m and poses its hips and
knees; align the outer placement group with the application's actual seat.
`read` holds the included open book between both hands. All other clips hide
the book. Every clip explicitly controls torso, head, upper/lower arms,
upper/lower legs, root position and book scale, so switching clips resets the
previous pose. Blending and movement through the world belong to the caller.

The environment GLB is a library: its four independent roots intentionally
overlap at the origin. Clone the desired named root, then place it in the scene.
Do not display the complete library scene as one arranged composition.

| Root | Contract |
| --- | --- |
| `bench` | 1.66 m wide; seat top about 0.47 m; faces +Z |
| `sign` | About 1.61 m tall; two arrows and a hanging illustrated postcard |
| `plinth` | Ground origin; top at about 0.708 m |
| `bust` | Own ground/socle origin; place at the top of a plinth |

## Browser loading and preview

The matching r180 browser loader is at
`web/vendor/three/addons/loaders/GLTFLoader.js`. Its only additional utility
dependency is the adjacent `../utils/BufferGeometryUtils.js`. Both files were
copied from the project's already installed `three@0.180.0` package, and only
their bare `three` import was changed to `../../three.module.js`.
The existing Three.js MIT license remains at `web/vendor/three/LICENSE`.

```js
import * as THREE from './vendor/three/three.module.js';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const traveler = await loader.loadAsync('./assets/planet/daylight/traveler.glb');
const placement = new THREE.Group();
placement.add(traveler.scene);
scene.add(placement);
traveler.scene.traverse(o => {
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
});
const mixer = new THREE.AnimationMixer(traveler.scene);
mixer.clipAction(traveler.animations.find(c => c.name === 'idle')).play();
// In the existing frame loop: mixer.update(deltaSeconds).

const library = await loader.loadAsync('./assets/planet/daylight/environment.glb');
const bench = library.scene.getObjectByName('bench').clone(true);
scene.add(bench);
```

Serve `web/` with an HTTP server that permits `.glb` files, and open
`/assets/planet/daylight/preview.html` for the standalone lit preview. The
selector tests all clips; the rear-view button and drag orbit inspect the
models. Add `?focus=traveler` or `?focus=bust` for close inspection. The preview
is a resource review aid and is independent of the application's interface.

```sh
python3 -m http.server 8083 --bind 127.0.0.1 --directory web
```

Readback results are in `validation.json`. The GLBs were also inspected in the
local browser preview, including the complete bust and the two-handed reading
pose. Application-level animation transitions and placement must be verified
by the integrating application.

## Landscape and runtime scenery

`alpine-dream.png` is an original AI-generated panoramic landscape made for this implementation: pale blue sky, warm alpine light and snow mountains. It is used as a distant layer only. The ground, giant ringed planet, flowers, trees, avatar and memory objects in the navigable area are real Three.js geometry. The supplied reference photographs are visual references and are not embedded in the app.

Terrain and vegetation are authored in `web/wander-world.js` and `web/wander-scenery.js`. High quality uses 11,000 instanced flowers, 32,000 grass clumps and a directional shadow map; light quality uses 6,500 flowers, 18,000 grass clumps and the character's contact shadow. The in-app settings offer automatic, rich and light quality. The September 12 scenery pass adds procedural path grain, curved petals, branched foliage, distant foothills and column details without replacing the GLB assets.
