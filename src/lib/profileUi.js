// Shared read-only profile presentation values.
export const defaultProfileView = {
  display_name: "名無しの観測者",
  username: "@silent_creator",
  bio: "まだ名前のない作品を、夜空に置いていく人。未完成の光を観測しています。",
  avatar: "創",
};

export function getAvatarText(value) {
  return value.trim().charAt(0) || defaultProfileView.avatar;
}
