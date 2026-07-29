import chunk0 from "./observeLogoChunk0.js";
import chunk1 from "./observeLogoChunk1.js";
import chunk2 from "./observeLogoChunk2.js";
import chunk3 from "./observeLogoChunk3.js";

const observeLogoDataUrl = `data:image/png;base64,${chunk0}${chunk1}${chunk2}${chunk3}`;

document.documentElement.style.setProperty(
  "--observe-logo-image",
  `url("${observeLogoDataUrl}")`,
);

export default observeLogoDataUrl;
