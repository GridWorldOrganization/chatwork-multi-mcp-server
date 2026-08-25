import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { listAccounts } from './chatworkClient';
import { postRoomMessage, updateRoomMessage, deleteRoomMessage } from './toolCallbacks';
import { store, setRooms } from './store';
import type { Room } from './types/room';

const originalChatworkApiToken = process.env['CHATWORK_API_TOKEN'];
const originalChatworkAccounts = process.env['CHATWORK_ACCOUNTS'];

beforeEach(() => {
  process.env['CHATWORK_API_TOKEN'] = 'default-token';
  delete process.env['CHATWORK_ACCOUNTS'];
});

afterEach(() => {
  if (originalChatworkApiToken === undefined) {
    delete process.env['CHATWORK_API_TOKEN'];
  } else {
    process.env['CHATWORK_API_TOKEN'] = originalChatworkApiToken;
  }

  if (originalChatworkAccounts === undefined) {
    delete process.env['CHATWORK_ACCOUNTS'];
  } else {
    process.env['CHATWORK_ACCOUNTS'] = originalChatworkAccounts;
  }

  vi.unstubAllGlobals();
});

describe('listAccounts', () => {
  test('returns default and named accounts from environment variables', () => {
    process.env['CHATWORK_ACCOUNTS'] =
      'account1:token_aaa, account2:token_bbb,bot:token_ccc';

    expect(listAccounts()).toEqual(['default', 'account1', 'account2', 'bot']);
  });
});

describe('postRoomMessage', () => {
  test('uses the requested account token without sending account_id in the body', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'bot:named-token';
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await postRoomMessage({
      account_id: 'bot',
      path: { room_id: 123 },
      body: { body: 'hello', self_unread: 0 },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const requestInit = init as RequestInit;

    expect(requestInit.headers).toMatchObject({
      'X-ChatWorkToken': 'named-token',
    });
    expect(String(requestInit.body)).toBe('body=hello&self_unread=0');
  });

  test('blocks postRoomMessage to direct room for fujino account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const directRoom: Room = { id: 427365528, type: 'direct', name: 'Test DM' };
    store.dispatch(setRooms({ account: 'fujino', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postRoomMessage({
        account_id: 'fujino',
        path: { room_id: 427365528 },
        body: { body: 'test', self_unread: 0 },
      }),
    ).rejects.toThrow('BLOCKED_DM_WRITE');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('allows postRoomMessage to group room for fujino account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const groupRoom: Room = { id: 411150588, type: 'group', name: 'Test Group' };
    store.dispatch(setRooms({ account: 'fujino', data: [groupRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await postRoomMessage({
      account_id: 'fujino',
      path: { room_id: 411150588 },
      body: { body: 'test', self_unread: 0 },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('fails closed for unresolved room type', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      postRoomMessage({
        account_id: 'fujino',
        path: { room_id: 999999 },
        body: { body: 'test', self_unread: 0 },
      }),
    ).rejects.toThrow('BLOCKED_ROOM_TYPE_UNRESOLVED');
  });

  test('does not block DM write for non-fujino accounts', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'yokota:yokota-token';
    const directRoom: Room = { id: 427365528, type: 'direct', name: 'Test DM' };
    store.dispatch(setRooms({ account: 'yokota', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await postRoomMessage({
      account_id: 'yokota',
      path: { room_id: 427365528 },
      body: { body: 'test', self_unread: 0 },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('updateRoomMessage', () => {
  test('blocks updateRoomMessage to direct room for fujino account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const directRoom: Room = { id: 427365528, type: 'direct', name: 'Test DM' };
    store.dispatch(setRooms({ account: 'fujino', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateRoomMessage({
        account_id: 'fujino',
        path: { room_id: 427365528, message_id: 123 },
        body: { body: 'updated', self_unread: 0 },
      }),
    ).rejects.toThrow('BLOCKED_DM_WRITE');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteRoomMessage', () => {
  test('blocks deleteRoomMessage to direct room for fujino account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const directRoom: Room = { id: 427365528, type: 'direct', name: 'Test DM' };
    store.dispatch(setRooms({ account: 'fujino', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deleteRoomMessage({
        account_id: 'fujino',
        path: { room_id: 427365528, message_id: 123 },
      }),
    ).rejects.toThrow('BLOCKED_DM_WRITE');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
