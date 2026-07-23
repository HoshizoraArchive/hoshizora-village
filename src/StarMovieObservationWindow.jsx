export const STAR_MOVIE_OBSERVATION_FRAME_ASSET =
  "/images/star-movie-observation-window-frame.png";

export default function StarMovieObservationWindow({ children, mediaKind }) {
  const isYouTube = mediaKind === "youtube";

  return (
    <div className="star-movie-observation-window w-full max-w-full">
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
