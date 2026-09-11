import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAccounts } from './chatworkClient';
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
  postRoomMessageFromFileParamsSchema,
  readRoomMessagesParamsSchema,
  rejectIncomingRequestParamsSchema,
  unreadRoomMessageParamsSchema,
  updateRoomLinkParamsSchema,
  updateRoomMembersParamsSchema,
  updateRoomMessageParamsSchema,
  updateRoomParamsSchema,
  updateRoomTasksStatusParamsSchema,
} from './schema';
import {
  acceptIncomingRequest,
  createRoom,
  createRoomLink,
  createRoomTask,
  deleteOrLeaveRoom,
  deleteRoomLink,
  deleteRoomMessage,
  getMe,
  getMyStatus,
  getRoom,
  getRoomFile,
  getRoomLink,
  getRoomMessage,
  getRoomTask,
  listContacts,
  listIncomingRequests,
  listMyTasks,
  listRoomFiles,
  listRoomMembers,
  listRoomMessages,
  listRooms,
  listRoomTasks,
  postRoomMessage,
  postRoomMessageFromFile,
  readRoomMessage,
  rejectIncomingRequest,
  unreadRoomMessage,
  updateRoom,
  updateRoomLink,
  updateRoomMembers,
  updateRoomMessage,
  updateRoomTaskStatus,
} from './toolCallbacks';

const PRESETS: Record<string, string[]> = {
  '0': [
    'list_accounts',
    'get_me',
    'get_my_status',
    'list_my_tasks',
    'list_contacts',
    'list_rooms',
    'get_room',
    'update_room',
    'list_room_members',
    'list_room_messages',
    'post_room_message',
    'read_room_messages',
    'unread_room_message',
    'get_room_message',
    'update_room_message',
    'delete_room_message',
    'list_room_tasks',
    'create_room_task',
    'get_room_task',
    'update_room_task_status',
    'list_room_files',
    'get_room_file',
    'get_room_link',
    'create_room_link',
    'update_room_link',
    'delete_room_link',
    'list_incoming_requests',
    'accept_incoming_request',
    'reject_incoming_request',
    'update_room_members',
  ],
  '1': [
    'list_accounts',
    'get_me',
    'get_my_status',
    'list_my_tasks',
    'list_contacts',
    'list_rooms',
    'get_room',
    'list_room_members',
    'list_room_messages',
    'post_room_message',
    'read_room_messages',
    'get_room_message',
    'list_room_tasks',
    'get_room_task',
    'list_room_files',
    'get_room_file',
  ],
  '2': [
    'list_accounts',
    'list_rooms',
    'get_room',
    'list_room_members',
    'list_room_messages',
    'post_room_message',
    'read_room_messages',
    'get_room_message',
  ],
};

const DEFAULT_ACTIVE_TOOLS = PRESETS['2'];

function parseActiveTools(): Set<string> {
  const individual = process.env['CHATWORK_ACTIVE_TOOLS'];
  if (individual) {
    return new Set(
      individual
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  const preset = process.env['CHATWORK_TOOL_PRESET'];
  if (preset && PRESETS[preset]) {
    return new Set(PRESETS[preset]);
  }
  return new Set(DEFAULT_ACTIVE_TOOLS);
}

const server = new McpServer({
  name: 'Chatwork',
  // FIXME: ハードコーディングではなくpackage.jsonのバージョンに合わせるようにする
  version: '0.0.1',
});

const activeTools = parseActiveTools();
const isActive = (name: string) => activeTools.has(name);

if (isActive('list_accounts')) {
  server.tool(
    'list_accounts',
    '利用可能なChatworkアカウントID一覧を返します。',
    () => ({
      content: [{ type: 'text', text: listAccounts().join('\n') }],
    }),
  );
}
if (isActive('get_me')) {
  server.tool(
    'get_me',
    '自分自身の情報を取得します。',
    accountOnlyParamsSchema.shape,
    getMe,
  );
}
if (isActive('get_my_status')) {
  server.tool(
    'get_my_status',
    '自分の未読数、自分宛ての未読の数、未完了タスク数を取得します。',
    accountOnlyParamsSchema.shape,
    getMyStatus,
  );
}
if (isActive('list_my_tasks')) {
  server.tool(
    'list_my_tasks',
    '自分のタスク一覧を最大100件まで取得します。',
    listMyTasksParamsSchema.shape,
    listMyTasks,
  );
}
if (isActive('list_contacts')) {
  server.tool(
    'list_contacts',
    '自分のコンタクト一覧を取得します。',
    accountOnlyParamsSchema.shape,
    listContacts,
  );
}
if (isActive('list_rooms')) {
  server.registerTool(
    'list_rooms',
    {
      description: 'チャット一覧を取得します。',
      inputSchema: listRoomsParamsSchema.shape,
    },
    listRooms,
  );
}
if (isActive('create_room')) {
  server.tool(
    'create_room',
    '新しいグループチャットを作成します。',
    createRoomParamsSchema.shape,
    createRoom,
  );
}
if (isActive('get_room')) {
  server.tool(
    'get_room',
    'チャットの情報（名前、アイコン、種類など）を取得します。',
    getRoomParamsSchema.shape,
    getRoom,
  );
}
if (isActive('update_room')) {
  server.tool(
    'update_room',
    'チャットの情報（名前、アイコンなど）を変更します。',
    updateRoomParamsSchema.shape,
    updateRoom,
  );
}
if (isActive('delete_or_leave_room')) {
  server.tool(
    'delete_or_leave_room',
    'グループチャットを退席、または削除します。',
    deleteOrLeaveRoomParamsSchema.shape,
    deleteOrLeaveRoom,
  );
}
if (isActive('list_room_members')) {
  server.tool(
    'list_room_members',
    'チャットのメンバー一覧を取得します。',
    listRoomMembersParamsSchema.shape,
    listRoomMembers,
  );
}
if (isActive('update_room_members')) {
  server.tool(
    'update_room_members',
    'チャットのメンバーを一括で変更します。',
    updateRoomMembersParamsSchema.shape,
    updateRoomMembers,
  );
}
if (isActive('list_room_messages')) {
  server.tool(
    'list_room_messages',
    'チャットのメッセージ一覧を最大100件まで取得します。',
    listRoomMessagesParamsSchema.shape,
    listRoomMessages,
  );
}
if (isActive('post_room_message')) {
  server.tool(
    'post_room_message',
    'チャットに新しいメッセージを投稿します。',
    postRoomMessageParamsSchema.shape,
    postRoomMessage,
  );
}
// PRESETSには未登録。CHATWORK_ACTIVE_TOOLS で明示的に列挙した場合のみ有効化される。
// 稼働中MCPを再起動・再設定するまでは、既存プリセット運用に一切影響しない。
if (isActive('post_room_message_from_file')) {
  server.tool(
    'post_room_message_from_file',
    '本文をファイル経由で渡してチャットに新しいメッセージを投稿します（body文字列をtool inputに含めない）。',
    postRoomMessageFromFileParamsSchema.shape,
    postRoomMessageFromFile,
  );
}
if (isActive('read_room_messages')) {
  server.tool(
    'read_room_messages',
    'チャットのメッセージを既読にします。',
    readRoomMessagesParamsSchema.shape,
    readRoomMessage,
  );
}
if (isActive('unread_room_message')) {
  server.tool(
    'unread_room_message',
    'チャットのメッセージを未読にします。',
    unreadRoomMessageParamsSchema.shape,
    unreadRoomMessage,
  );
}
if (isActive('get_room_message')) {
  server.tool(
    'get_room_message',
    'チャットのメッセージを取得します。',
    getRoomMessageParamsSchema.shape,
    getRoomMessage,
  );
}
if (isActive('update_room_message')) {
  server.tool(
    'update_room_message',
    'チャットのメッセージを更新します。',
    updateRoomMessageParamsSchema.shape,
    updateRoomMessage,
  );
}
if (isActive('delete_room_message')) {
  server.tool(
    'delete_room_message',
    'チャットのメッセージを削除します。',
    deleteRoomMessageParamsSchema.shape,
    deleteRoomMessage,
  );
}
if (isActive('list_room_tasks')) {
  server.tool(
    'list_room_tasks',
    'チャットのタスク一覧を最大100件まで取得します。',
    listRoomTasksParamsSchema.shape,
    listRoomTasks,
  );
}
if (isActive('create_room_task')) {
  server.tool(
    'create_room_task',
    'チャットに新しいタスクを追加します。',
    createRoomTaskParamsSchema.shape,
    createRoomTask,
  );
}
if (isActive('get_room_task')) {
  server.tool(
    'get_room_task',
    'チャットのタスクの情報を取得します。',
    getRoomTaskParamsSchema.shape,
    getRoomTask,
  );
}
if (isActive('update_room_task_status')) {
  server.tool(
    'update_room_task_status',
    'チャットのタスクの完了状態を変更します。',
    updateRoomTasksStatusParamsSchema.shape,
    updateRoomTaskStatus,
  );
}
if (isActive('list_room_files')) {
  server.tool(
    'list_room_files',
    'チャットのファイル一覧を最大100件まで取得します。',
    listRoomFilesParamsSchema.shape,
    listRoomFiles,
  );
}
if (isActive('get_room_file')) {
  server.tool(
    'get_room_file',
    'チャットのファイルの情報を取得します。',
    getRoomFileParamsSchema.shape,
    getRoomFile,
  );
}
if (isActive('get_room_link')) {
  server.tool(
    'get_room_link',
    'チャットへの招待リンクを取得します。',
    getRoomLinkParamsSchema.shape,
    getRoomLink,
  );
}
if (isActive('create_room_link')) {
  server.tool(
    'create_room_link',
    'チャットへの招待リンクを作成します。',
    createRoomLinkParamsSchema.shape,
    createRoomLink,
  );
}
if (isActive('update_room_link')) {
  server.tool(
    'update_room_link',
    'チャットへの招待リンクを変更します。',
    updateRoomLinkParamsSchema.shape,
    updateRoomLink,
  );
}
if (isActive('delete_room_link')) {
  server.tool(
    'delete_room_link',
    'チャットへの招待リンクを削除します。',
    deleteRoomLinkParamsSchema.shape,
    deleteRoomLink,
  );
}
if (isActive('list_incoming_requests')) {
  server.tool(
    'list_incoming_requests',
    '自分へのコンタクト承認依頼一覧を最大100件まで取得します。',
    accountOnlyParamsSchema.shape,
    listIncomingRequests,
  );
}
if (isActive('accept_incoming_request')) {
  server.tool(
    'accept_incoming_request',
    '自分へのコンタクト承認依頼を承認します。',
    acceptIncomingRequestParamsSchema.shape,
    acceptIncomingRequest,
  );
}
if (isActive('reject_incoming_request')) {
  server.tool(
    'reject_incoming_request',
    '自分へのコンタクト承認依頼を拒否します。',
    rejectIncomingRequestParamsSchema.shape,
    rejectIncomingRequest,
  );
}

export { server };
