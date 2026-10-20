// An async result belongs only to the media draft generation and Auth session that started it.
export function createPostMediaTaskGate() {
  let generation = 0;

  return {
    capture(sessionKey) {
      return { generation, sessionKey };
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(ticket, sessionKey) {
      return ticket?.generation === generation && ticket.sessionKey === sessionKey;
    },
  };
}
