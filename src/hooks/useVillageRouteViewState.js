import { useState } from "react";

export function useVillageRouteViewState(getRouteFromLocation) {
  const [activeTab, setActiveTab] = useState("observe");
  const [route, setRoute] = useState(() => getRouteFromLocation());
  const [detailPost, setDetailPost] = useState(null);
  const [detailPostLoading, setDetailPostLoading] = useState(false);
  const [detailPostError, setDetailPostError] = useState("");
  const [publicProfile, setPublicProfile] = useState(null);
  const [publicProfileTags, setPublicProfileTags] = useState([]);
  const [publicProfilePosts, setPublicProfilePosts] = useState([]);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState("");
  const [meteorTagView, setMeteorTagView] = useState(null);
  const [meteorTagPosts, setMeteorTagPosts] = useState([]);
  const [meteorTagLoading, setMeteorTagLoading] = useState(false);
  const [meteorTagError, setMeteorTagError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [profileShareMessage, setProfileShareMessage] = useState("");
  const [profileShareError, setProfileShareError] = useState("");
  return {
    activeTab,
    setActiveTab,
    route,
    setRoute,
    detailPost,
    setDetailPost,
    detailPostLoading,
    setDetailPostLoading,
    detailPostError,
    setDetailPostError,
    publicProfile,
    setPublicProfile,
    publicProfileTags,
    setPublicProfileTags,
    publicProfilePosts,
    setPublicProfilePosts,
    publicProfileLoading,
    setPublicProfileLoading,
    publicProfileError,
    setPublicProfileError,
    meteorTagView,
    setMeteorTagView,
    meteorTagPosts,
    setMeteorTagPosts,
    meteorTagLoading,
    setMeteorTagLoading,
    meteorTagError,
    setMeteorTagError,
    shareMessage,
    setShareMessage,
    shareError,
    setShareError,
    profileShareMessage,
    setProfileShareMessage,
    profileShareError,
    setProfileShareError,
  };
}
