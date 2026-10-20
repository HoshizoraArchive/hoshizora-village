import { useRef, useState } from "react";
import { AVATAR_CROP_MIN_ZOOM, METEOR_VIDEO_MAX_DURATION_SECONDS } from "../lib/mediaEditorUtils.js";

export function usePostMediaDraftState({ coverFallbackHeight, coverFallbackWidth }) {
  const [postDraft, setPostDraft] = useState("");
  const [postImageDrafts, setPostImageDrafts] = useState([]);
  const postImageDraftsRef = useRef([]);
  const [postVideoDraft, setPostVideoDraft] = useState(null);
  const postVideoDraftRef = useRef(null);
  const [postThumbnailDraft, setPostThumbnailDraft] = useState(null);
  const postThumbnailDraftRef = useRef(null);
  const [postVideoPreparing, setPostVideoPreparing] = useState(false);
  const [postVideoTrimDraft, setPostVideoTrimDraft] = useState(null);
  const postVideoTrimDraftRef = useRef(null);
  const [postVideoTrimStart, setPostVideoTrimStart] = useState(0);
  const [postVideoTrimLength, setPostVideoTrimLength] = useState(METEOR_VIDEO_MAX_DURATION_SECONDS);
  const [postVideoTrimProgress, setPostVideoTrimProgress] = useState(0);
  const [postVideoTrimProcessing, setPostVideoTrimProcessing] = useState(false);
  const [postVideoTrimError, setPostVideoTrimError] = useState("");
  const postVideoTrimConversionRef = useRef(null);
  const postVideoTrimCancelRequestedRef = useRef(false);
  const [postCoverCropFile, setPostCoverCropFile] = useState(null);
  const [postCoverCropPreviewUrl, setPostCoverCropPreviewUrl] = useState("");
  const [postCoverCropModalOpen, setPostCoverCropModalOpen] = useState(false);
  const [postCoverCropZoom, setPostCoverCropZoom] = useState(AVATAR_CROP_MIN_ZOOM);
  const [postCoverCropOffset, setPostCoverCropOffset] = useState({ x: 0, y: 0 });
  const [postCoverImageSize, setPostCoverImageSize] = useState(null);
  const [postCoverCropFrameSize, setPostCoverCropFrameSize] = useState({
    height: coverFallbackHeight,
    width: coverFallbackWidth,
  });
  const [postCoverCropPreparing, setPostCoverCropPreparing] = useState(false);
  return {
    postDraft,
    setPostDraft,
    postImageDrafts,
    setPostImageDrafts,
    postImageDraftsRef,
    postVideoDraft,
    setPostVideoDraft,
    postVideoDraftRef,
    postThumbnailDraft,
    setPostThumbnailDraft,
    postThumbnailDraftRef,
    postVideoPreparing,
    setPostVideoPreparing,
    postVideoTrimDraft,
    setPostVideoTrimDraft,
    postVideoTrimDraftRef,
    postVideoTrimStart,
    setPostVideoTrimStart,
    postVideoTrimLength,
    setPostVideoTrimLength,
    postVideoTrimProgress,
    setPostVideoTrimProgress,
    postVideoTrimProcessing,
    setPostVideoTrimProcessing,
    postVideoTrimError,
    setPostVideoTrimError,
    postVideoTrimConversionRef,
    postVideoTrimCancelRequestedRef,
    postCoverCropFile,
    setPostCoverCropFile,
    postCoverCropPreviewUrl,
    setPostCoverCropPreviewUrl,
    postCoverCropModalOpen,
    setPostCoverCropModalOpen,
    postCoverCropZoom,
    setPostCoverCropZoom,
    postCoverCropOffset,
    setPostCoverCropOffset,
    postCoverImageSize,
    setPostCoverImageSize,
    postCoverCropFrameSize,
    setPostCoverCropFrameSize,
    postCoverCropPreparing,
    setPostCoverCropPreparing,
  };
}
