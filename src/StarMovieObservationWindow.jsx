// Visual maintenance map: docs/star-movie-observation-mode.md
export const STAR_MOVIE_OBSERVATION_FRAME_ASSET =
  "/images/star-movie-observation-window-frame.png";

export const STAR_MOVIE_OBSERVATION_APERTURE_CLIP_ID =
  "star-movie-observation-aperture";

// Traced from the PNG's transparent inner aperture and expanded by two source
// pixels. Coordinates are normalized to the aperture bounds so native movie
// controls remain inside the visible window while the rim keeps its exact shape.
export const STAR_MOVIE_OBSERVATION_APERTURE_PATH =
  "M 0 0.494058 L 0.007115 0.293718 L 0.028458 0.174873 L 0.050593 0.139219 L 0.060079 0.135823 L 0.072727 0.076401 L 0.081423 0.062818 L 0.110672 0.027165 L 0.135968 0.016978 L 0.288538 0.025467 L 0.301976 0 L 0.694071 0 L 0.710672 0.025467 L 0.791304 0.016978 L 0.879051 0.022071 L 0.917787 0.062818 L 0.929644 0.089983 L 0.937549 0.135823 L 0.966008 0.162988 L 0.983399 0.234295 L 1 0.388795 L 1 0.619694 L 0.990514 0.726655 L 0.978656 0.794567 L 0.959684 0.848896 L 0.941502 0.874363 L 0.934387 0.916808 L 0.928063 0.91511 L 0.915415 0.947368 L 0.871937 0.994907 L 0.837945 0.998302 L 0.767589 0.998302 L 0.750988 0.989813 L 0.702767 0.998302 L 0.294862 0.998302 L 0.253755 0.989813 L 0.216601 1 L 0.12332 0.991511 L 0.079051 0.943973 L 0.065613 0.913413 L 0.057708 0.876061 L 0.031621 0.83871 L 0.016601 0.78438 L 0 0.643463 Z";

export default function StarMovieObservationWindow({ children, mediaKind }) {
  const isYouTube = mediaKind === "youtube";

  return (
    <div className="star-movie-observation-window w-full max-w-full">
      <svg
        aria-hidden="true"
        className="star-movie-observation-clip-definitions"
        focusable="false"
      >
        <defs>
          <clipPath
            clipPathUnits="objectBoundingBox"
            id={STAR_MOVIE_OBSERVATION_APERTURE_CLIP_ID}
          >
            <path d={STAR_MOVIE_OBSERVATION_APERTURE_PATH} />
          </clipPath>
        </defs>
      </svg>

      <div className="star-movie-observation-window-viewport">
        <div
          className={`star-movie-observation-frame ${
            isYouTube
              ? "star-movie-observation-youtube-frame"
              : "star-movie-observation-upload-frame h-full w-full"
          }`}
        >
          {children}
        </div>
      </div>

      <img
        alt=""
        aria-hidden="true"
        className="star-movie-observation-window-art"
        draggable="false"
        src={STAR_MOVIE_OBSERVATION_FRAME_ASSET}
      />
    </div>
  );
}
