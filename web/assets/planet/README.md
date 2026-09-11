# Personal planet assets

`surface.png` is an original AI-generated landscape created for this implementation on 2026-09-11 (1672 × 941). It depicts a dark mountain valley, layered mist, distant ridges and a small lone tree. It is used as the distant landscape layer; the planet, rings, stars, foreground terrain, atmosphere and memory lights are rendered separately in Three.js.

The seven user-provided images informed composition, scale and the black / ice-blue / amber palette. None of those images is bundled, cropped into a website background, or served to visitors.

All sounds are synthesized locally by `../../audio.js`: seeded stereo wind, sine partials, filtered sweeps and event envelopes. No downloaded music, stock effects, voice recordings, microphone input or external audio service is used.

Three.js 0.180.0 is pinned in `../../package-lock.json`, distributed in `../../vendor/three/`, and retains its MIT license in that directory. To refresh the vendored files after an intentional version change, copy `node_modules/three/build/three.module.js`, `three.core.js` and `node_modules/three/LICENSE` into that directory, then rerun browser acceptance.
