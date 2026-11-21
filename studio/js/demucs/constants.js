/* Demucs model constants — adapted from timcsy/demucs-web (MIT).
   Reference: https://github.com/timcsy/demucs-web */
export const CONSTANTS = {
  SAMPLE_RATE: 44100,
  FFT_SIZE: 4096,
  HOP_SIZE: 1024,
  TRAINING_SAMPLES: 343980,   // 44100 * 7.8 s
  MODEL_SPEC_BINS: 2048,
  MODEL_SPEC_FRAMES: 336,
  SEGMENT_OVERLAP: 0.25,
  TRACKS: ['drums', 'bass', 'other', 'vocals']
};

export const AI_MODELS = [
  {
    id: 'htdemucs_ft',
    name: 'HTDemucs-FT',
    tag: 'fine-tuned',
    desc: 'Fine-tuned HTDemucs model that runs on your device in this browser.',
    url: 'https://huggingface.co/Kani95/htdemucs-ft-ort/resolve/main/htdemucs_ft.onnx',
    size: 174266467,
    sha256: '21cdabc8246f5052397647399e48292dc7394475e92335c65c19eb7e90bde6e0',
    credit: 'Kani95/htdemucs-ft-ort'
  },
  {
    id: 'htdemucs',
    name: 'HTDemucs',
    tag: 'Meta v4',
    desc: 'Meta HTDemucs v4 — original hybrid transformer; weaker but a useful reference',
    url: 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx',
    size: 180534758,
    credit: 'timcsy/demucs-web-onnx (Meta weights, MIT)'
  }
];
