# 🎵 Advanced Audio Stem Separator

[![Website](https://img.shields.io/badge/Website-Live-brightgreen)](https://vicsanity623.github.io)
[![PWA](https://img.shields.io/badge/PWA-Installable-blue)](https://vicsanity623.github.io)
[![Powered By](https://img.shields.io/badge/Powered%20By-Demucs%20AI-ff0055)](https://github.com/facebookresearch/demucs)

If browser (Firefox MOBILE WORKS but desktop version of FIREFOX does not currently work) it is recommended to use a popular widely used and widely supported browser like CHROME OR SAFARI OR BRAVE BROWSER, but browsers like firefox have been so far behind in support for modern stuff that only about 200K users are actively using it. if it is blocked make sure there is no ad-blockers or script blockers. v1.5 has patched a false positive BLOCK on firefox. webpage should now accept all browsers. AD-BLOCKERS are still banned from access. SAFARI/CHROME/BRAVE/OPERA have been tested and work. firefox is dead!

A professional, **100% free**, web-based tool that separates audio tracks into individual stems (**Vocals, Drums, Bass, Other**) using the state-of-the-art **Demucs** AI engine.

This project was built to provide a high-quality alternative to paywalled services like Lala.ai or Splitter.ai, running entirely on volunteer hardware with **no file limits**.

🔗 **Try it now:** https://vicsanity623.github.io

---

## ✨ Features

- **🚫 No Paywalls & No Limits**: Upload long tracks (FLAC, WAV, MP3) without "pay-per-minute" restrictions.
- **💎 Dual AI Models**:
  - **⚡ Speed Mode:** Uses standard `htdemucs` for fast results (~2 mins).
  - **💎 Ultra Quality:** Uses `htdemucs_ft` (Fine-Tuned) for audiophile-grade separation with minimized bleed.
- **📱 PWA Ready**: Installable as a native app on iOS and Android.
- **🌊 Interactive Player**: Real-time waveform visualization using **WaveSurfer.js** with "Solo Mode" playback.
- **🔒 Privacy First**: Files are processed in RAM on a secure backend and deleted immediately after download generation.

---

## 🧠 Under the Hood

This is a **headless implementation** of Meta's Demucs, orchestrated via a custom Python backend and served securely over the public internet.

### The Architecture
1. **Frontend:** Hosted on GitHub Pages (Static HTML/JS).
2. **Tunneling:** Uses **Tailscale Funnel** to create an encrypted pipeline from the user to the local server.
3. **Backend:** A Python Flask API running locally on an **Intel iMac**.
4. **Queue System:** Implements a FIFO (First-In-First-Out) queue to manage multiple users on a single GPU/CPU resource.

### The Models
| Mode | Model ID | Description |
| :--- | :--- | :--- |
| **Speed Mode** | `htdemucs` | Hybrid Transformer. Great balance of speed and quality. Best for sketching ideas. |
| **Ultra Quality** | `htdemucs_ft` | Fine-Tuned. Heavier neural network trained on a larger dataset. Focuses on cleaner high-end frequencies and vocal isolation. |

---

## ⚠️ Performance & Server Status

**Please Read Carefully**

This service runs on **personal hardware**, not a cloud farm.

- **Queueing:** If multiple users upload simultaneously, you will see a *"Waiting in queue"* message. Please be patient.
- **Processing Time:**
  - *Speed Mode:* ~2–3 minutes per song.
  - *Ultra Mode:* ~5–8 minutes per song (due to heavy computation).
- **Availability:** If the site hangs or fails to connect, the host machine may be offline for maintenance.

---

## 📜 Strict Usage Policy

⚠️ **EDUCATIONAL USE ONLY**

This tool is intended for **educational, research, forensic, and production use** on content you own or have permission to modify.

1. ✅ You **must own** the rights to uploaded audio.
2. ❌ Do **not upload copyrighted music** without explicit permission.
3. ✅ You are **fully responsible** for the usage of the separated stems.

> **Legal Notice**
> We do not store user content. All files are transient and wiped after processing. Using this tool to infringe on copyright is strictly prohibited.

---

## 🛠️ Technical Stack

- **Frontend:** HTML5, CSS3, JavaScript
- **Visualization:** [WaveSurfer.js](https://wavesurfer-js.org/)
- **Backend API:** Python Flask
- **Secure Tunnel:** [Tailscale Funnel](https://tailscale.com/)
- **AI Engine:** [Demucs (Meta Research)](https://github.com/facebookresearch/demucs)

---

## 🙏 Acknowledgments

This project relies on the incredible work by the Meta Research team:

```bibtex
@article{defossez2021hybrid,
  title={Hybrid Spectrogram and Waveform Source Separation},
  author={Défossez, Alexandre},
  journal={arXiv preprint arXiv:2111.03600},
  year={2021}
}
