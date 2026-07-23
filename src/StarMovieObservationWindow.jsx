export const STAR_MOVIE_OBSERVATION_FRAME_ASSET =
  "/images/star-movie-observation-window-frame.png";

export const STAR_MOVIE_OBSERVATION_APERTURE_CLIP_ID =
  "star-movie-observation-aperture";

// Traced from the PNG's transparent inner aperture and expanded by two source
// pixels so the movie sits beneath the blue inner rim without leaking outside it.
export const STAR_MOVIE_OBSERVATION_APERTURE_PATH =
  "M 0.08724 0.48856 L 0.093099 0.329744 L 0.110677 0.235532 L 0.128906 0.207268 L 0.136719 0.204576 L 0.147135 0.15747 L 0.154297 0.146703 L 0.178385 0.118439 L 0.199219 0.110363 L 0.32487 0.117093 L 0.335938 0.096904 L 0.658854 0.096904 L 0.672526 0.117093 L 0.738932 0.110363 L 0.811198 0.114401 L 0.843099 0.146703 L 0.852865 0.168237 L 0.859375 0.204576 L 0.882812 0.22611 L 0.897135 0.282638 L 0.910807 0.405114 L 0.910807 0.588156 L 0.902995 0.672948 L 0.893229 0.726783 L 0.877604 0.769852 L 0.86263 0.79004 L 0.856771 0.823688 L 0.851562 0.822342 L 0.841146 0.847914 L 0.805339 0.885599 L 0.777344 0.888291 L 0.719401 0.888291 L 0.705729 0.881561 L 0.666016 0.888291 L 0.330078 0.888291 L 0.296224 0.881561 L 0.265625 0.889637 L 0.188802 0.882907 L 0.152344 0.845222 L 0.141276 0.820996 L 0.134766 0.791386 L 0.113281 0.761777 L 0.100911 0.718708 L 0.08724 0.606999 Z";

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
