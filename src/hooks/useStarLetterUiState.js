import { useRef, useState } from "react";
import { createOperationRequestIdStore } from "../starLetterThread.js";
import { createEntityRequestVersionStore } from "../appDataFreshness.js";

export function useStarLetterUiState() {
  const [starLettersByPostId, setStarLettersByPostId] = useState({});
  const starLettersByPostIdRef = useRef({});
  const [starLettersLoading, setStarLettersLoading] = useState(false);
  const [starLettersError, setStarLettersError] = useState("");
  const [starLettersMessage, setStarLettersMessage] = useState("");
  const [starLetterSavingPostId, setStarLetterSavingPostId] = useState(null);
  const [openStarLetterPostId, setOpenStarLetterPostId] = useState(null);
  const [starLetterDrafts, setStarLetterDrafts] = useState({});
  const [editingStarLetterId, setEditingStarLetterId] = useState(null);
  const [starLetterEditDrafts, setStarLetterEditDrafts] = useState({});
  const [starLetterUpdatingId, setStarLetterUpdatingId] = useState(null);
  const [starLetterDeletingId, setStarLetterDeletingId] = useState(null);
  const [starLetterReplyComposer, setStarLetterReplyComposer] = useState(null);
  const [starLetterReplySavingId, setStarLetterReplySavingId] = useState(null);
  const [starLetterResonatingIds, setStarLetterResonatingIds] = useState(() => new Set());
  const [starLetterArchivingIds, setStarLetterArchivingIds] = useState(() => new Set());
  const [highlightedStarLetterId, setHighlightedStarLetterId] = useState(null);
  const starLetterRequestIdsRef = useRef(createOperationRequestIdStore());
  const starLetterRequestVersionsRef = useRef(createEntityRequestVersionStore());
  const archivedStarLettersRequestVersionRef = useRef(0);
  return {
    starLettersByPostId,
    setStarLettersByPostId,
    starLettersByPostIdRef,
    starLettersLoading,
    setStarLettersLoading,
    starLettersError,
    setStarLettersError,
    starLettersMessage,
    setStarLettersMessage,
    starLetterSavingPostId,
    setStarLetterSavingPostId,
    openStarLetterPostId,
    setOpenStarLetterPostId,
    starLetterDrafts,
    setStarLetterDrafts,
    editingStarLetterId,
    setEditingStarLetterId,
    starLetterEditDrafts,
    setStarLetterEditDrafts,
    starLetterUpdatingId,
    setStarLetterUpdatingId,
    starLetterDeletingId,
    setStarLetterDeletingId,
    starLetterReplyComposer,
    setStarLetterReplyComposer,
    starLetterReplySavingId,
    setStarLetterReplySavingId,
    starLetterResonatingIds,
    setStarLetterResonatingIds,
    starLetterArchivingIds,
    setStarLetterArchivingIds,
    highlightedStarLetterId,
    setHighlightedStarLetterId,
    starLetterRequestIdsRef,
    starLetterRequestVersionsRef,
    archivedStarLettersRequestVersionRef,
  };
}
