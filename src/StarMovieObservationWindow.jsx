export default function StarMovieObservationWindow({ children, mediaKind }) {
  const isYouTube = mediaKind === "youtube";

  return (
    <div
      className={`star-movie-observation-window ${
        isYouTube
          ? "star-movie-observation-window-youtube w-full"
          : "star-movie-observation-window-upload w-fit max-w-full"
      }`}
    >
      <div
        className={`star-movie-observation-frame relative overflow-hidden ${
          isYouTube
            ? "star-movie-observation-youtube-frame aspect-video w-full"
            : "star-movie-observation-upload-frame w-fit max-w-full"
        }`}
      >
        {children}
      </div>

      <div
        aria-hidden="true"
        className="star-movie-observation-window-ornaments"
      >
        <span className="star-movie-observation-window-star star-movie-observation-window-star-top-left" />
        <span className="star-movie-observation-window-star star-movie-observation-window-star-top-right" />
        <span className="star-movie-observation-window-star star-movie-observation-window-star-bottom-left" />
        <span className="star-movie-observation-window-star star-movie-observation-window-star-bottom-right" />
      </div>
    </div>
  );
}
