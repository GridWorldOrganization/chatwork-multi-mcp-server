import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  chatworkClient,
  resolveAccountId,
  ChatworkClientResponse,
} from './chatworkClient';
import { store, setRooms, selectPaginatedRooms, selectRooms } from './store';
import { validateRoomsArray } from './types/room';
import {
  acceptIncomingRequestParamsSchema,
  accountOnlyParamsSchema,
  createRoomLinkParamsSchema,
  createRoomParamsSchema,
  createRoomTaskParamsSchema,
  deleteOrLeaveRoomParamsSchema,
  deleteRoomLinkParamsSchema,
  deleteRoomMessageParamsSchema,
  getRoomFileParamsSchema,
  getRoomLinkParamsSchema,
  getRoomMessageParamsSchema,
  getRoomParamsSchema,
  getRoomTaskParamsSchema,
  listMyTasksParamsSchema,
  listRoomFilesParamsSchema,
  listRoomMembersParamsSchema,
  listRoomMessagesParamsSchema,
  listRoomsParamsSchema,
  listRoomTasksParamsSchema,
  postRoomMessageParamsSchema,
  readRoomMessagesParamsSchema,
  rejectIncomingRequestParamsSchema,
  unreadRoomMessageParamsSchema,
  updateRoomLinkParamsSchema,
  updateRoomMembersParamsSchema,
  updateRoomMessageParamsSchema,
  updateRoomParamsSchema,
  updateRoomTasksStatusParamsSchema,
} from './schema';
import { z } from 'zod';

function chatworkClientResponseToCallToolResult(
  res: ChatworkClientResponse,
): CallToolResult {
  if (!res.ok) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: status code ${res.status}`,
        },
        {
          type: 'resource',
          resource: {
            uri: res.uri,
            text: res.response,
          },
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: res.response,
      },
      {
        type: 'resource',
        resource: {
          uri: res.uri,
          text: 'Chatwork',
        },
      },
    ],
  };
}

/**
 * DM room write blocker for all accounts
 * Checks room type and throws if attempting to write to a direct message room.
 * Fail-closed: if room type cannot be determined, blocks the operation.
 * Preflight: on cache miss, fetches room list via GET /rooms to resolve room type.
 */
async function checkDirectRoomWriteBlock(
  account_id: string,
  room_id: string | number,
): Promise<void> {
  const resolvedAccount = resolveAccountId(account_id);
  let rooms = selectRooms(store.getState(), resolvedAccount);

  if (rooms) {
    // Try to find the room in cache
    const room = rooms.find((r) => r.room_id === Number(room_id));
    if (room) {
      if (room.type === 'direct') {
        throw new Error(
          `BLOCKED_DM_WRITE: account=${account_id} cannot write to direct room ${room_id}`,
        );
      }
      // Room found and is group or my: allow
      return;
    }
    // Room not found in cache - continue to preflight fetch
  }

  // Cache miss or room not found: preflight fetch via GET /rooms
  const response = await chatworkClient(account_id).request({
    path: '/rooms',
    method: 'GET',
    query: {},
    body: {},
  });

  if (!response.ok) {
    // ChatWork API error: fail-closed
    throw new Error(
      `BLOCKED_ROOM_TYPE_UNRESOLVED: account=${account_id} room=${room_id} - preflight GET /rooms failed (status ${response.status})`,
    );
  }

  // Parse and validate room list
  try {
    const allRooms = validateRoomsArray(JSON.parse(response.response));

    // Update cache with fetched rooms
    store.dispatch(setRooms({ account: resolvedAccount, data: allRooms, ttl: 5 * 60 * 1000 }));

    // Now try to find room in freshly fetched list
    const room = allRooms.find((r) => r.room_id === Number(room_id));

    if (!room) {
      // Room not found in ChatWork API response: fail-closed
      throw new Error(
        `BLOCKED_ROOM_TYPE_UNRESOLVED: account=${account_id} room=${room_id} - room not found in ChatWork API`,
      );
    }

    if (room.type === 'direct') {
      throw new Error(
        `BLOCKED_DM_WRITE: account=${account_id} cannot write to direct room ${room_id}`,
      );
    }

    // Room found and is group or my: allow
    return;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('BLOCKED_')) {
      throw err;
    }
    // Validation or parse error: fail-closed
    throw new Error(
      `BLOCKED_ROOM_TYPE_UNRESOLVED: account=${account_id} room=${room_id} - failed to parse/validate room list: ${(err as Error).message}`,
    );
  }
}

export const getMe = (req: z.infer<typeof accountOnlyParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: '/me',
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const getMyStatus = (req: z.infer<typeof accountOnlyParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: '/my/status',
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const listMyTasks = (req: z.infer<typeof listMyTasksParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: '/my/tasks',
      method: 'GET',
      query: req.query,
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const listContacts = (req: z.infer<typeof accountOnlyParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: '/contacts',
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const listRooms = async (
  args: z.infer<typeof listRoomsParamsSchema>,
): Promise<CallToolResult> => {
  const { offset = 0, limit = 100 } = args;

  const CACHE_TTL = 5 * 60 * 1000; // 5分

  // キャッシュはアカウント（解決済みキー）ごとに分離する
  const account = resolveAccountId(args.account_id);

  // Check if we have cached rooms for this account
  let paginatedRooms = selectPaginatedRooms(
    store.getState(),
    account,
    offset,
    limit,
  );

  if (!paginatedRooms) {
    // Cache miss or expired - fetch from API
    const response = await chatworkClient(args.account_id).request({
      path: '/rooms',
      method: 'GET',
      query: {},
      body: {},
    });

    if (!response.ok) {
      return chatworkClientResponseToCallToolResult(response);
    }

    const allRooms = validateRoomsArray(JSON.parse(response.response));

    // Store in Redux with TTL, keyed by account
    store.dispatch(setRooms({ account, data: allRooms, ttl: CACHE_TTL }));

    // Get paginated data from updated store
    paginatedRooms =
      selectPaginatedRooms(store.getState(), account, offset, limit) || [];
  }

  const paginatedResponse: ChatworkClientResponse = {
    ok: true,
    status: 200,
    response: JSON.stringify(paginatedRooms),
    uri: '/rooms',
  };

  return chatworkClientResponseToCallToolResult(paginatedResponse);
};

export const createRoom = (req: z.infer<typeof createRoomParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: '/rooms',
      method: 'POST',
      body: req.body,
      query: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const getRoom = (req: z.infer<typeof getRoomParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}`,
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const updateRoom = (req: z.infer<typeof updateRoomParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const deleteOrLeaveRoom = (
  req: z.infer<typeof deleteOrLeaveRoomParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}`,
      method: 'DELETE',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const listRoomMembers = (
  req: z.infer<typeof listRoomMembersParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/members`,
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const updateRoomMembers = (
  req: z.infer<typeof updateRoomMembersParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/members`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const listRoomMessages = async (
  req: z.infer<typeof listRoomMessagesParamsSchema>,
): Promise<CallToolResult> => {
  const response = await chatworkClient(req.account_id).request({
    path: `/rooms/${req.path.room_id}/messages`,
    method: 'GET',
    query: { force: req.query.force },
    body: {},
  });

  // API成功時、runtime file保存
  if (response.ok) {
    const runtimeRoot = 'C:\\claude_code\\runtime\\makasete\\chatwork-mcp';
    const accountId = req.account_id || 'default';

    // Account ID path safety check - allow only alphanumeric, underscore, and hyphen
    if (!/^[A-Za-z0-9_-]+$/.test(accountId)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'PARSER_INPUT_INVALID_ACCOUNT_ID',
          },
        ],
      };
    }

    const accountDir = `${runtimeRoot}\\${accountId}`;
    const filename = `room-${req.path.room_id}-latest.json`;
    const filepath = `${accountDir}\\${filename}`;

    const parserInput = JSON.stringify([
      {
        type: 'text',
        text: response.response,
      },
      {
        type: 'text',
        text: `[Resource from chatwork-multi at ${response.uri}]`,
      },
    ]);

    try {
      await (
        await import('fs')
      ).promises.mkdir(accountDir, { recursive: true });
      await (
        await import('fs')
      ).promises.writeFile(filepath, parserInput, 'utf-8');
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PARSER_INPUT_SAVE_FAILED: ${(err as Error).message}`,
          },
        ],
      };
    }

    // compact_result=true の場合、summary のみを返す
    if (req.query.compact_result === true) {
      let messageCount = 0;
      try {
        const messages = JSON.parse(response.response);
        messageCount = Array.isArray(messages) ? messages.length : 0;
      } catch {}

      return {
        content: [
          {
            type: 'text',
            text: `CHATWORK_FETCH_SAVED\naccount_id=${accountId}\nroom_id=${req.path.room_id}\nforce=${req.query.force || 0}\nmessage_count=${messageCount}\nsaved_path=${filepath}\nresource_uri=${response.uri}`,
          },
        ],
      };
    }
  }

  return chatworkClientResponseToCallToolResult(response);
};

export const postRoomMessage = async (
  req: z.infer<typeof postRoomMessageParamsSchema>,
) => {
  await checkDirectRoomWriteBlock(req.account_id, req.path.room_id);

  return chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages`,
      method: 'POST',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);
};

export const readRoomMessage = (
  req: z.infer<typeof readRoomMessagesParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/read`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const unreadRoomMessage = (
  req: z.infer<typeof unreadRoomMessageParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/unread`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const getRoomMessage = (
  req: z.infer<typeof getRoomMessageParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/${req.path.message_id}`,
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const updateRoomMessage = async (
  req: z.infer<typeof updateRoomMessageParamsSchema>,
) => {
  await checkDirectRoomWriteBlock(req.account_id, req.path.room_id);

  return chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/${req.path.message_id}`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);
};

export const deleteRoomMessage = async (
  req: z.infer<typeof deleteRoomMessageParamsSchema>,
) => {
  await checkDirectRoomWriteBlock(req.account_id, req.path.room_id);

  return chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/${req.path.message_id}`,
      method: 'DELETE',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);
};

export const listRoomTasks = (req: z.infer<typeof listRoomTasksParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/tasks`,
      method: 'GET',
      query: req.query,
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const createRoomTask = (
  req: z.infer<typeof createRoomTaskParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/tasks`,
      method: 'POST',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const getRoomTask = (req: z.infer<typeof getRoomTaskParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/tasks/${req.path.task_id}`,
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const updateRoomTaskStatus = (
  req: z.infer<typeof updateRoomTasksStatusParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/tasks/${req.path.task_id}/status`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const listRoomFiles = (req: z.infer<typeof listRoomFilesParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/files`,
      method: 'GET',
      query: req.query,
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const getRoomFile = (req: z.infer<typeof getRoomFileParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/files/${req.path.file_id}`,
      method: 'GET',
      query: req.query,
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const getRoomLink = (req: z.infer<typeof getRoomLinkParamsSchema>) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/link`,
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const createRoomLink = (
  req: z.infer<typeof createRoomLinkParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/link`,
      method: 'POST',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const updateRoomLink = (
  req: z.infer<typeof updateRoomLinkParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/link`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const deleteRoomLink = (
  req: z.infer<typeof deleteRoomLinkParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/link`,
      method: 'DELETE',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const listIncomingRequests = (
  req: z.infer<typeof accountOnlyParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: '/incoming_requests',
      method: 'GET',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const acceptIncomingRequest = (
  req: z.infer<typeof acceptIncomingRequestParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/incoming_requests/${req.path.request_id}/accept`,
      method: 'PUT',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

export const rejectIncomingRequest = (
  req: z.infer<typeof rejectIncomingRequestParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/incoming_requests/${req.path.request_id}/reject`,
      method: 'DELETE',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);
