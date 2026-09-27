const WORDS_A = ['sunny', 'bouncy', 'fuzzy', 'happy', 'zippy', 'comfy', 'jolly', 'brave', 'witty', 'lucky'];
const WORDS_B = ['otter', 'panda', 'mango', 'comet', 'pickle', 'waffle', 'koala', 'rocket', 'noodle', 'pebble'];

const pick = (list: string[]) => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];

// Reads ?room= from the URL, or makes up a friendly name like "sunny-otter-42".
export function resolveRoomId(): string {
  const params = new URLSearchParams(location.search);
  let id = (params.get('room') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!id) {
    id = `${pick(WORDS_A)}-${pick(WORDS_B)}-${10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90)}`;
    history.replaceState(null, '', `?room=${id}`);
  }
  return id;
}

export const inviteLink = (room: string) => `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
