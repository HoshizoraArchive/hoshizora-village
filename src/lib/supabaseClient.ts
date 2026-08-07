import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[Supabase] Missing ${name}. Set it in Netlify environment variables and local .env before using Supabase features.`,
    );
  }

  return value;
}

const baseSupabase = createClient(
  requireEnv("VITE_SUPABASE_URL", supabaseUrl),
  requireEnv("VITE_SUPABASE_ANON_KEY", supabaseAnonKey),
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

function getActorDisplayName(actorProfile: { display_name?: string | null; username?: string | null } | null) {
  return actorProfile?.display_name || actorProfile?.username || "誰か";
}

function formatNotificationMessage(
  notification: { message?: string | null; type?: string | null },
  actorProfile: { display_name?: string | null; username?: string | null } | null,
) {
  const actorName = getActorDisplayName(actorProfile);

  if (notification.type === "resonance") {
    return `${actorName}さんがあなたの流星便に共鳴しました。`;
  }

  if (notification.type === "star_letter") {
    return `${actorName}さんがあなたに星文を送りました。`;
  }

  if (notification.type === "archive") {
    return `${actorName}さんがあなたの流星便をArchiveしました。`;
  }

  return notification.message || `${actorName}さんからRe:Connectが届きました。`;
}

async function withActorNotificationMessages(response: any) {
  const rows = Array.isArray(response?.data) ? response.data : response?.data ? [response.data] : [];
  const notificationRows = rows.filter((row: any) => row?.actor_id && row?.type);
  const actorIds = [...new Set(notificationRows.map((row: any) => row.actor_id))];
  const profilesById = new Map();

  if (actorIds.length > 0) {
    const { data } = await baseSupabase.from("profiles").select("id, display_name, username").in("id", actorIds);

    for (const profile of data ?? []) {
      profilesById.set(profile.id, profile);
    }
  }

  function enrichNotification(notification: any) {
    if (!notification?.type) {
      return notification;
    }

    const actorProfile = profilesById.get(notification.actor_id) ?? null;

    return {
      ...notification,
      message: formatNotificationMessage(notification, actorProfile),
    };
  }

  return {
    ...response,
    data: Array.isArray(response?.data) ? response.data.map(enrichNotification) : enrichNotification(response?.data),
  };
}

function wrapNotificationsQuery(query: any): any {
  return new Proxy(query, {
    get(target, property, receiver) {
      if (property === "then") {
        return (onFulfilled: any, onRejected: any) =>
          Promise.resolve(target).then(withActorNotificationMessages).then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        return result && typeof result === "object" ? wrapNotificationsQuery(result) : result;
      };
    },
  });
}

export const supabase = new Proxy(baseSupabase, {
  get(target, property, receiver) {
    if (property === "from") {
      return (relation: string) => {
        const query = target.from(relation);
        return relation === "notifications" ? wrapNotificationsQuery(query) : query;
      };
    }

    return Reflect.get(target, property, receiver);
  },
}) as typeof baseSupabase;
