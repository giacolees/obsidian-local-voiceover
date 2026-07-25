# Third-Party Notices

Inflect v2 includes or adapts portions of the following open-source projects.
Their licenses apply to the corresponding portions; the rest of the Inflect v2
package is provided under the root Apache-2.0 license.

## VITS

- Project: VITS (`jaywalnut310/vits`)
- Copyright: Copyright (c) 2021 Jaehyeon Kim
- License: MIT
- Packaged license: `third_party/VITS_LICENSE.txt`

The compact model architecture and several inference runtime modules derive from
VITS. The text frontend also retains its original Keith Ito MIT license at
`runtime/text/LICENSE`.

## BigVGAN

- Project: BigVGAN (`NVIDIA/BigVGAN`)
- Copyright: Copyright (c) 2024 NVIDIA CORPORATION
- License: MIT
- Packaged license: `third_party/BIGVGAN_LICENSE.txt`

The lightweight alias-free waveform activation implementation derives from
BigVGAN's alias-free design and was adapted for this compact runtime.

## alias-free-torch

- Project: `alias-free-torch` (`junjun3518/alias-free-torch`)
- License: Apache License 2.0
- Packaged license: `third_party/ALIAS_FREE_TORCH_LICENSE.txt`

The anti-aliased activation resampling design used by the compact waveform
runtime includes concepts and adapted implementation structure from
`alias-free-torch`.

## ephone / eSpeak-NG WASM

- Package: `ephone` 1.0.2 (`sjmik/ephone-js`)
- License: GPL-3.0-or-later
- Upstream source: <https://github.com/sjmik/ephone-js>
- Packaged license: `third_party/EPHONE_COPYING.txt`
- Pinned artifact SHA-256: `ephone.js`
  `3953f66df632cdce59cb400e5552bec802a3b1333ac60aaf86f04365c103c00f`;
  `lang/en-us.js`
  `8bfbd0c6dd9ebca08217343f0b0723fd6e46fbaab1b03a57d168ac68a23a0d4d`.

The browser frontend distributes this eSpeak-NG-derived WASM runtime and its
English-US language data. Any downstream distribution must comply with GPL-3.0-or-later,
including corresponding-source availability for the shipped build.
