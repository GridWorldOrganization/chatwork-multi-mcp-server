import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAccounts } from './chatworkClient';
import {
  getRoomParamsSchema,
  listRoomMessagesParamsSchema,
  postRoomMessageParamsSchema,
  readRoomMessagesParamsSchema,
} from './schema';
import {
  getRoom,
  listRoomMessages,
  postRoomMessage,
  readRoomMessage,
} from './toolCallbacks';

const server = new McpServer({
  name: 'Chatwork',
  // FIXME: ハードコーディングではなくpackage.jsonのバージョンに合わせるようにする
  version: '0.0.1',
});

server.tool(
  'list_accounts',
  '利用可能なChatworkアカウントID一覧を返します。',
  () => ({
    content: [{ type: 'text', text: listAccounts().join('\n') }],
  }),
);
server.tool(
  'get_room',
  'チャットの情報（名前、アイコン、種類など）を取得します。',
  getRoomParamsSchema.shape,
  getRoom,
);
server.tool(
  'list_room_messages',
  'チャットのメッセージ一覧を最大100件まで取得します。',
  listRoomMessagesParamsSchema.shape,
  listRoomMessages,
);
server.tool(
  'post_room_message',
  'チャットに新しいメッセージを投稿します。',
  postRoomMessageParamsSchema.shape,
  postRoomMessage,
);
server.tool(
  'read_room_messages',
  'チャットのメッセージを既読にします。',
  readRoomMessagesParamsSchema.shape,
  readRoomMessage,
);

/*
 * コンテキスト削減のため、投稿と該当チャンネル閲覧以外のMCPツールは登録しない。
 * 再有効化する場合は必要なschema/callback importを戻したうえで、対象のserver.toolを戻す。
 *
 * server.tool('get_me', '自分自身の情報を取得します。', getMe);
 * server.tool(
 *   'get_my_status',
 *   '自分の未読数、自分宛ての未読の数、未完了タスク数を取得します。',
 *   getMyStatus,
 * );
 * server.tool(
 *   'list_my_tasks',
 *   '自分のタスク一覧を最大100件まで取得します。',
 *   listMyTasksParamsSchema.shape,
 *   listMyTasks,
 * );
 * server.tool(
 *   'list_contacts',
 *   '自分のコンタクト一覧を取得します。',
 *   listContacts,
 * );
 * server.tool('list_rooms', 'チャット一覧を取得します。', listRooms);
 * server.tool(
 *   'create_room',
 *   '新しいグループチャットを作成します。',
 *   createRoomParamsSchema.shape,
 *   createRoom,
 * );
 * server.tool(
 *   'update_room',
 *   'チャットの情報（名前、アイコンなど）を変更します。',
 *   updateRoomParamsSchema.shape,
 *   updateRoom,
 * );
 * server.tool(
 *   'delete_or_leave_room',
 *   'グループチャットを退席、または削除します。',
 *   deleteOrLeaveRoomParamsSchema.shape,
 *   deleteOrLeaveRoom,
 * );
 * server.tool(
 *   'list_room_members',
 *   'チャットのメンバー一覧を取得します。',
 *   listRoomMembersParamsSchema.shape,
 *   listRoomMembers,
 * );
 * server.tool(
 *   'update_room_members',
 *   'チャットのメンバーを一括で変更します。',
 *   updateRoomMembersParamsSchema.shape,
 *   updateRoomMembers,
 * );
 * server.tool(
 *   'unread_room_message',
 *   'チャットのメッセージを未読にします。',
 *   unreadRoomMessageParamsSchema.shape,
 *   unreadRoomMessage,
 * );
 * server.tool(
 *   'get_room_message',
 *   'チャットのメッセージを取得します。',
 *   getRoomMessageParamsSchema.shape,
 *   getRoomMessage,
 * );
 * server.tool(
 *   'update_room_message',
 *   'チャットのメッセージを更新します。',
 *   updateRoomMessageParamsSchema.shape,
 *   updateRoomMessage,
 * );
 * server.tool(
 *   'delete_room_message',
 *   'チャットのメッセージを削除します。',
 *   deleteRoomMessageParamsSchema.shape,
 *   deleteRoomMessage,
 * );
 * server.tool(
 *   'list_room_tasks',
 *   'チャットのタスク一覧を最大100件まで取得します。',
 *   listRoomTasksParamsSchema.shape,
 *   listRoomTasks,
 * );
 * server.tool(
 *   'create_room_task',
 *   'チャットに新しいタスクを追加します。',
 *   createRoomTaskParamsSchema.shape,
 *   createRoomTask,
 * );
 * server.tool(
 *   'get_room_task',
 *   'チャットのタスクの情報を取得します。',
 *   getRoomTaskParamsSchema.shape,
 *   getRoomTask,
 * );
 * server.tool(
 *   'update_room_task_status',
 *   'チャットのタスクの完了状態を変更します。',
 *   updateRoomTasksStatusParamsSchema.shape,
 *   updateRoomTaskStatus,
 * );
 * server.tool(
 *   'list_room_files',
 *   'チャットのファイル一覧を最大100件まで取得します。',
 *   listRoomFilesParamsSchema.shape,
 *   listRoomFiles,
 * );
 * server.tool(
 *   'get_room_file',
 *   'チャットのファイルの情報を取得します。',
 *   getRoomFileParamsSchema.shape,
 *   getRoomFile,
 * );
 * server.tool(
 *   'get_room_link',
 *   'チャットへの招待リンクを取得します。',
 *   getRoomLinkParamsSchema.shape,
 *   getRoomLink,
 * );
 * server.tool(
 *   'create_room_link',
 *   'チャットへの招待リンクを作成します。',
 *   createRoomLinkParamsSchema.shape,
 *   createRoomLink,
 * );
 * server.tool(
 *   'update_room_link',
 *   'チャットへの招待リンクを変更します。',
 *   updateRoomLinkParamsSchema.shape,
 *   updateRoomLink,
 * );
 * server.tool(
 *   'delete_room_link',
 *   'チャットへの招待リンクを削除します。',
 *   deleteRoomLinkParamsSchema.shape,
 *   deleteRoomLink,
 * );
 * server.tool(
 *   'list_incoming_requests',
 *   '自分へのコンタクト承認依頼一覧を最大100件まで取得します。',
 *   listIncomingRequests,
 * );
 * server.tool(
 *   'accept_incoming_request',
 *   '自分へのコンタクト承認依頼を承認します。',
 *   acceptIncomingRequestParamsSchema.shape,
 *   acceptIncomingRequest,
 * );
 * server.tool(
 *   'reject_incoming_request',
 *   '自分へのコンタクト承認依頼を拒否します。',
 *   rejectIncomingRequestParamsSchema.shape,
 *   rejectIncomingRequest,
 * );
 */

export { server };
