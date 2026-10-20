import { useState } from "react";

export function useFeedbackUiState(feedbackTypes) {
  const [feedbackType, setFeedbackType] = useState(feedbackTypes[0]);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  return {
    feedbackType,
    setFeedbackType,
    feedbackBody,
    setFeedbackBody,
    feedbackSaving,
    setFeedbackSaving,
    feedbackMessage,
    setFeedbackMessage,
    feedbackError,
    setFeedbackError,
  };
}
