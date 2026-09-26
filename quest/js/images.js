// AI image generation. Uses Pollinations (https://pollinations.ai), which
// needs no account or key: the image is generated from the URL itself, so a
// prompt can be dropped straight into an <img>.
import { ART_STYLES } from './presets.js';
import { getSettings } from './store.js';

// Same prompt -> same seed -> same picture, so images survive reloads.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 1000000;
}

export function imagesEnabled() {
  return getSettings().images !== 'off';
}

export function imageUrl(prompt, { w = 768, h = 512, style, seed } = {}) {
  if (!prompt || !imagesEnabled()) return '';
  const s = getSettings();
  const styleText = ART_STYLES[style || s.artStyle] || ART_STYLES.anime;
  const full = `${prompt}, ${styleText}, no text, no watermark`;
  const params = new URLSearchParams({
    width: w, height: h, seed: seed ?? hash(full), nologo: 'true', model: 'flux',
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?${params}`;
}
