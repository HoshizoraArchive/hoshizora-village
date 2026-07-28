// Keep the presentation tree independent from the normalized RPC response.
// The database keeps every depth; the UI deliberately uses one visual indent.
export function buildStarLetterThreadRows(letters = []) {
  const byId = new Map();

  for (const letter of letters) {
    if (letter?.id) {
      byId.set(letter.id, letter);
    }
  }

  const childrenByParentId = new Map();
  const roots = [];

  for (const letter of letters) {
    if (!letter?.id) {
      continue;
    }

    if (letter.parentStarLetterId && byId.has(letter.parentStarLetterId)) {
      const children = childrenByParentId.get(letter.parentStarLetterId) ?? [];
      children.push(letter);
      childrenByParentId.set(letter.parentStarLetterId, children);
    } else {
      // A physically removed parent must not hide the surviving reply.
      roots.push(letter);
    }
  }

  const compareLetters = (left, right) =>
    String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) ||
    String(left.id).localeCompare(String(right.id));
  const rows = [];
  const visited = new Set();

  function visit(letter, depth) {
    if (!letter?.id || visited.has(letter.id)) {
      return;
    }

    visited.add(letter.id);
    rows.push({
      ...letter,
      actualDepth: depth,
      displayDepth: Math.min(depth, 1),
    });

    for (const child of (childrenByParentId.get(letter.id) ?? []).sort(compareLetters)) {
      visit(child, depth + 1);
    }
  }

  for (const root of roots.sort(compareLetters)) {
    visit(root, 0);
  }

  // Defensive fallback for malformed legacy data. The DB trigger rejects cycles,
  // but no record should disappear merely because an old row is inconsistent.
  for (const letter of [...byId.values()].sort(compareLetters)) {
    visit(letter, 0);
  }

  return rows;
}

export function createOperationRequestIdStore(createId = () => crypto.randomUUID()) {
  const requestIds = new Map();

  return {
    get(key) {
      if (!requestIds.has(key)) {
        requestIds.set(key, createId());
      }

      return requestIds.get(key);
    },
    clear(key) {
      requestIds.delete(key);
    },
  };
}

export function isStarLetterThreadNotification(notification) {
  return Boolean(
    notification?.star_letter_id &&
      ["star_letter", "star_letter_reply", "star_letter_resonance"].includes(notification.type),
  );
}
