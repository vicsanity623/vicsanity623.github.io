# NOTICE — third-party components & attribution

PRISM ships with the following third-party components. Licenses are retained below.

## ONNX Runtime (vendored, `vendor/ort/`)
- **ONNX Runtime Web v1.31.1** — © Microsoft Corporation.
- MIT License. Full text in `vendor/ort/LICENSE.txt`.
- https://github.com/microsoft/onnxruntime

## Demucs inference pipeline (`js/demucs/`)
- Adapted from **demucs-web** — © timcsy — MIT License.
- https://github.com/timcsy/demucs-web

## Models (downloaded once on demand, cached on-device)
- **HTDemucs** / **HTDemucs fine-tuned** weights — © Meta Platforms.
- Released by Meta under the MIT License.
- ONNX conversion: `timcsy/demucs-web-onnx` (HTDemucs, 180 MB) and
  `Kani95/htdemucs-ft-ort` (HTDemucs-FT, 166 MB), both MIT-licensed open models.
- The model is fetched from Hugging Face Hub on first use and cached in the
  browser Cache API. Deleting `prism-ai-models-v1` from DevTools → Application
  removes it.

## Meta AI / models
Demucs is © Meta Platforms, Inc. — MIT License.
https://github.com/facebookresearch/demucs

## FFmpeg (bundled, `tools/bin/`)
- **ffmpeg / ffprobe** static builds for macOS x86_64 (Evermeet.cx / tessus),
  downloaded verbatim from <https://evermeet.cx/ffmpeg/> — build
  `N-128970-g11337618b23-tessus`.
- FFmpeg is licensed under the LGPL-2.1-or-later (GPL variants where enabled);
  source for this exact build: <https://git.ffmpeg.org/ffmpeg.git>.
- Used solely for audio decoding/encoding inside the app. Nothing is uploaded.

## python / test tooling
The dev-only Node test uses no dependencies.
