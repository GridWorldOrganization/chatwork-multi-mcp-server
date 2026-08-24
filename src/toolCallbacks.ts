import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  chatworkClient,
  resolveAccountId,
  ChatworkClientResponse,
} from './chatworkClient';
import { store, setRooms, selectPaginatedRooms } from './store';
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
    query: req.query,
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
  }

  return chatworkClientResponseToCallToolResult(response);
};

export const postRoomMessage = (
  req: z.infer<typeof postRoomMessageParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages`,
      method: 'POST',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

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

export const updateRoomMessage = (
  req: z.infer<typeof updateRoomMessageParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/${req.path.message_id}`,
      method: 'PUT',
      query: {},
      body: req.body,
    })
    .then(chatworkClientResponseToCallToolResult);

export const deleteRoomMessage = (
  req: z.infer<typeof deleteRoomMessageParamsSchema>,
) =>
  chatworkClient(req.account_id)
    .request({
      path: `/rooms/${req.path.room_id}/messages/${req.path.message_id}`,
      method: 'DELETE',
      query: {},
      body: {},
    })
    .then(chatworkClientResponseToCallToolResult);

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
