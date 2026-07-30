import chunk0 from "./observeLogoChunk0.js";
import chunk1 from "./observeLogoChunk1.js";
import chunk2 from "./observeLogoChunk2.js";
import chunk3 from "./observeLogoChunk3.js";

const observeLogoBase64 = `${chunk0}${chunk1}${chunk2}${chunk3}`;

function createObserveLogoObjectUrl(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}

const observeLogoObjectUrl = createObserveLogoObjectUrl(observeLogoBase64);

document.documentElement.style.setProperty(
  "--observe-logo-image",
  `url("${observeLogoObjectUrl}")`,
);
document.documentElement.dataset.observeLogoReady = "true";

window.addEventListener(
  "pagehide",
  () => {
    URL.revokeObjectURL(observeLogoObjectUrl);
  },
  { once: true },
);

export default observeLogoObjectUrl;
