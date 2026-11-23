# PRISM Audio Studio

PRISM is a static, browser-based stem splitter and multitrack editor, with a small set of public guide and policy pages. Audio processing and editing run on the visitor's device; there is no inference server or audio-upload API in this deployment.

## What runs in the browser

- **HTDemucs-FT** and **HTDemucs**: ONNX models loaded by ONNX Runtime Web. A visitor downloads the selected model from Hugging Face on first use (about 166 MB for HTDemucs-FT); the browser caches it locally when possible.
- **Fast / Studio / Deep**: DSP-based separation modes that do not require the AI model download.
- **Mobile safeguard**: AI inference is disabled on phones and tablets because the 166 MB model and inference memory can cause mobile browsers to kill and reload the tab. The DSP modes remain available on mobile.
- **Editor**: multitrack timeline, effects, frequency tools, analysis and WAV/MP3/project export.
- **MDX-Net is not enabled on this hosted app.** The MDX implementation in the source editor expects a separate local Python server. Do not advertise MDX as an in-browser feature until a browser inference implementation is added and tested.

The editor itself is served from `studio/`; the public entry point is `index.html`. The local AI model weights are not checked into this repository.

## Hosting

### GitHub Pages

This repo is structured for a user-site at `https://vicsanity623.github.io/`.

1. Push the repository to `vicsanity623/vicsanity623.github.io`.
2. In **Settings → Pages**, choose the `main` branch and `/ (root)`.
3. Confirm `https://vicsanity623.github.io/ads.txt` is reachable and the publisher ID matches the AdSense account.

`.nojekyll`, `robots.txt` and `sitemap.xml` are included.

### Firebase Hosting

`firebase.json` is configured to serve this directory as static files. To deploy to a Firebase Hosting site, select or create the Firebase project/site in the Firebase CLI, then run:

```sh
firebase login
firebase use --add
firebase deploy --only hosting
```

No Cloud Functions, Firebase Storage or inference backend is required. The ONNX Runtime Web assets in `studio/vendor/ort/` are static runtime files; model weights are fetched by each user's browser from Hugging Face. Review the Firebase Spark plan's hosting transfer/storage allowances before promoting a high-traffic site.

## AdSense

The approved publisher Auto-Ads script is included on the landing page and informational pages; `ads.txt` is retained. The editor does not inject ads over its full-screen controls. Ad display is still controlled by the AdSense account, page eligibility, consent requirements and Google's crawl/review timing; publishing the script does not guarantee immediate ad serving or revenue.

## Google sign-in

The previous Firebase project's Google Authentication config is retained as an **optional** sign-in on the public pages and editor. Sign-in is not required to process audio and is not connected to cloud project storage in this static version. `vicsanity623.github.io` is already listed under **Firebase Authentication → Settings → Authorized domains**. The Firebase client config is public by design; enforce security with Firebase Authentication settings and Firestore Security Rules, never with client-side secrets.

## Legal and attribution

See `privacy.html`, `terms.html` and `studio/NOTICE.md`. The policy pages should be reviewed for the actual AdSense consent setup, hosting configuration and applicable law before publication. The editor and third-party components retain their respective notices and licenses.

## itch.io launch kit

`promo/itch/PAGE-COPY.md` contains ready-to-paste project copy and setup details; `promo/itch/UPLOAD-CHECKLIST.md` has the publishing checklist. The cover, four real editor screenshots and short workflow GIF are in `promo/itch/assets/`. The itch page should link to the approved site rather than embed a second copy of the app.

## Local development

Serve the repository over HTTP(S), rather than opening the HTML files directly, so ES modules, workers, browser storage and ONNX assets work:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Some browser AI features require HTTPS or localhost and sufficient memory.
