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
    const groupRoom: Room = {
      room_id: 123,
      name: 'Test Room',
      type: 'group',
      role: 'admin',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 10,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/rooms')) {
        return new Response(JSON.stringify([groupRoom]), { status: 200 });
      }
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await postRoomMessage({
      account_id: 'bot',
      path: { room_id: 123 },
      body: { body: 'hello', self_unread: 0 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1] ?? [];
    const requestInit = init as RequestInit;

    expect(requestInit.headers).toMatchObject({
      'X-ChatWorkToken': 'named-token',
    });
    expect(String(requestInit.body)).toBe('body=hello&self_unread=0');
  });

  test('blocks postRoomMessage to direct room for fujino account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const directRoom: Room = {
      room_id: 427365528,
      name: 'Test DM',
      type: 'direct',
      role: 'member',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 50,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };
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
    const groupRoom: Room = {
      room_id: 411150588,
      name: 'Test Group',
      type: 'group',
      role: 'admin',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 100,
      file_num: 5,
      task_num: 2,
      icon_path: '',
      last_update_time: 1000000,
    };
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
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postRoomMessage({
        account_id: 'fujino',
        path: { room_id: 999999 },
        body: { body: 'test', self_unread: 0 },
      }),
    ).rejects.toThrow('BLOCKED_ROOM_TYPE_UNRESOLVED');
  });

  test('blocks DM write for sakura account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'sakura:sakura-token';
    const directRoom: Room = {
      room_id: 427365528,
      name: 'Test DM',
      type: 'direct',
      role: 'member',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 50,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };
    store.dispatch(setRooms({ account: 'sakura', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postRoomMessage({
        account_id: 'sakura',
        path: { room_id: 427365528 },
        body: { body: 'test', self_unread: 0 },
      }),
    ).rejects.toThrow('BLOCKED_DM_WRITE');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('blocks DM write for yokota account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'yokota:yokota-token';
    const directRoom: Room = {
      room_id: 427365528,
      name: 'Test DM',
      type: 'direct',
      role: 'member',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 50,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };
    store.dispatch(setRooms({ account: 'yokota', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postRoomMessage({
        account_id: 'yokota',
        path: { room_id: 427365528 },
        body: { body: 'test', self_unread: 0 },
      }),
    ).rejects.toThrow('BLOCKED_DM_WRITE');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('allows postRoomMessage to group room for sakura account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'sakura:sakura-token';
    const groupRoom: Room = {
      room_id: 411150588,
      name: 'Test Group',
      type: 'group',
      role: 'admin',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 100,
      file_num: 5,
      task_num: 2,
      icon_path: '',
      last_update_time: 1000000,
    };
    store.dispatch(setRooms({ account: 'sakura', data: [groupRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await postRoomMessage({
      account_id: 'sakura',
      path: { room_id: 411150588 },
      body: { body: 'test', self_unread: 0 },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('resolves room type via preflight GET /rooms on cache miss for group', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'yokota:yokota-token';
    const groupRoom: Room = {
      room_id: 411150588,
      name: 'Test Group',
      type: 'group',
      role: 'admin',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 100,
      file_num: 5,
      task_num: 2,
      icon_path: '',
      last_update_time: 1000000,
    };

    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/rooms')) {
        return new Response(JSON.stringify([groupRoom]), { status: 200 });
      }
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await postRoomMessage({
      account_id: 'yokota',
      path: { room_id: 411150588 },
      body: { body: 'test', self_unread: 0 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toMatch(/\/rooms$/);
    expect(calls[1]).toMatch(/\/rooms\/411150588\/messages$/);
  });

  test('blocks DM write via preflight GET /rooms on cache miss', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const directRoom: Room = {
      room_id: 427365528,
      name: 'Test DM',
      type: 'direct',
      role: 'member',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 50,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };

    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/rooms')) {
        return new Response(JSON.stringify([directRoom]), { status: 200 });
      }
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

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toMatch(/\/rooms$/);
  });
});

describe('updateRoomMessage', () => {
  test('blocks updateRoomMessage to direct room for fujino account', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    const directRoom: Room = {
      room_id: 427365528,
      name: 'Test DM',
      type: 'direct',
      role: 'member',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 50,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };
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
    const directRoom: Room = {
      room_id: 427365528,
      name: 'Test DM',
      type: 'direct',
      role: 'member',
      sticky: false,
      unread_num: 0,
      mention_num: 0,
      mytask_num: 0,
      message_num: 50,
      file_num: 0,
      task_num: 0,
      icon_path: '',
      last_update_time: 1000000,
    };
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
