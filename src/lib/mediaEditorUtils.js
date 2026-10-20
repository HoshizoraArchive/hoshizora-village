// Pure crop geometry and media formatting shared by screens and editors.
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const AVATAR_CROP_MIN_ZOOM = 1;

export const AVATAR_CROP_MAX_ZOOM = 6;

export const METEOR_IMAGE_MAX_COUNT = 4;

export const METEOR_VIDEO_MAX_DURATION_SECONDS = 35;

export function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getAvatarCoverScale(imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize) {
    return 1;
  }

  return Math.max(frameSize / imageSize.width, frameSize / imageSize.height);
}

export function constrainAvatarCropOffset(offset, zoom, imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize) {
    return offset;
  }

  const coverScale = getAvatarCoverScale(imageSize, frameSize);
  const displayedWidth = imageSize.width * coverScale * zoom;
  const displayedHeight = imageSize.height * coverScale * zoom;
  const maxX = Math.max(0, (displayedWidth - frameSize) / 2);
  const maxY = Math.max(0, (displayedHeight - frameSize) / 2);

  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY),
  };
}

export function getPostCoverCropScale(imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize?.width || !frameSize?.height) {
    return 1;
  }

  return Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height);
}

export function constrainPostCoverCropOffset(offset, zoom, imageSize, frameSize) {
  if (!imageSize?.width || !imageSize?.height || !frameSize?.width || !frameSize?.height) {
    return offset;
  }

  const coverScale = getPostCoverCropScale(imageSize, frameSize);
  const displayedWidth = imageSize.width * coverScale * zoom;
  const displayedHeight = imageSize.height * coverScale * zoom;
  const maxX = Math.max(0, (displayedWidth - frameSize.width) / 2);
  const maxY = Math.max(0, (displayedHeight - frameSize.height) / 2);

  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY),
  };
}

export function formatMediaDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatFileSize(bytes) {
  const safeBytes = Number(bytes) || 0;

  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(safeBytes / 1024))}KB`;
}
