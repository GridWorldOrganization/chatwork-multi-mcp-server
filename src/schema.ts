import { z } from 'zod';

const accountIdSchema = z
  .string()
  .optional()
  .describe(
    '使用するアカウントID（CHATWORK_ACCOUNTS で定義した名前。例: yokota / fujino）。' +
      '省略時は default（CHATWORK_API_TOKEN）→ CHATWORK_DEFAULT_ACCOUNT →（アカウントが1件ならそれ）の順で解決。',
  );

/** account_id のみを受け取る（引数を持たないツール用）。 */
export const accountOnlyParamsSchema = z
  .object({
    account_id: accountIdSchema,
  })
  .describe('アカウント指定のみ');

/** @see https://developer.chatwork.com/reference/get-rooms */
export const listRoomsParamsSchema = z
  .object({
    account_id: accountIdSchema,
    offset: z.number().int().min(0).default(0).describe('取得開始位置'),
    limit: z.number().int().min(1).max(100).default(100).describe('取得件数'),
  })
  .describe('チャット一覧取得');

/** @see https://developer.chatwork.com/reference/get-my-tasks */
export const listMyTasksParamsSchema = z
  .object({
    account_id: accountIdSchema,
    query: z.object({
      assigned_by_account_id: z
        .number()
        .int()
        .optional()
        .describe('タスクの依頼者のアカウントID'),
      status: z
        .enum(['open', 'done'])
        .optional()
        .describe('タスクのステータス（open: 未完了, done: 完了）'),
    }),
  })
  .describe('自分のタスク一覧取得');

/** @see https://developer.chatwork.com/reference/post-rooms */
export const createRoomParamsSchema = z
  .object({
    account_id: accountIdSchema,
    body: z.object({
      name: z.string().min(1).max(255).describe('グループチャット名'),
      description: z.string().optional().describe('グループチャットの説明'),
      link: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(0)
        .describe('招待リンクを作成するかどうか (0: 作成しない, 1: 作成する)'),
      link_code: z
        .string()
        .min(1)
        .max(50)
        .optional()
        .describe('招待リンクのリンクコード'),
      link_need_acceptance: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(1)
        .describe('承認要否 (0: 不要, 1: 必要)'),
      members_admin_ids: z
        .string()
        .describe('管理者権限のユーザーのID (カンマ区切り)'),
      members_member_ids: z
        .string()
        .optional()
        .describe('メンバー権限のユーザーのID (カンマ区切り)'),
      members_readonly_ids: z
        .string()
        .optional()
        .describe('閲覧のみ権限のユーザーのID (カンマ区切り)'),
      icon_preset: z
        .string()
        .optional()
        .describe('グループチャットのアイコンプリセット'),
    }),
  })
  .describe('新規グループチャット作成');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id */
export const getRoomParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
  })
  .describe('チャット情報取得');

/** @see https://developer.chatwork.com/reference/put-rooms-room_id */
export const updateRoomParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      name: z
        .string()
        .min(1)
        .max(255)
        .optional()
        .describe('グループチャット名'),
      description: z.string().optional().describe('グループチャットの説明'),
      icon_preset: z
        .string()
        .optional()
        .describe('グループチャットのアイコンプリセット'),
    }),
  })
  .describe('チャット情報更新');

/** @see https://developer.chatwork.com/reference/delete-rooms-room_id */
export const deleteOrLeaveRoomParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      action_type: z
        .enum(['leave', 'delete'])
        .describe('操作の種類 (leave: 退席, delete: 削除)'),
    }),
  })
  .describe('グループチャット退席/削除');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-members */
export const listRoomMembersParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
  })
  .describe('チャットメンバー一覧取得');

/** @see https://developer.chatwork.com/reference/put-rooms-room_id-members */
export const updateRoomMembersParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      members_admin_ids: z
        .string()
        .describe('管理者権限のユーザーのID (カンマ区切り)'),
      members_member_ids: z
        .string()
        .optional()
        .describe('メンバー権限のユーザーのID (カンマ区切り)'),
      members_readonly_ids: z
        .string()
        .optional()
        .describe('閲覧のみ権限のユーザーのID (カンマ区切り)'),
    }),
  })
  .describe('チャットメンバー一括変更');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-messages */
export const listRoomMessagesParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    query: z.object({
      force: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(0)
        .describe(
          '未読にかかわらず最新の100件を取得するか (0: しない, 1: する)',
        ),
      compact_result: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Claude へ返すresultを圧縮するか (false: raw message本文を含める, true: summary のみ)',
        ),
    }),
  })
  .describe('チャットメッセージ一覧取得');

/** @see https://developer.chatwork.com/reference/post-rooms-room_id-messages */
export const postRoomMessageParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      body: z.string().describe('メッセージ本文'),
      self_unread: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(0)
        .describe('自分自身を未読にするか (0: しない, 1: する)'),
    }),
  })
  .describe('チャットメッセージ投稿');

/**
 * post_room_message_from_file 専用スキーマ。
 *
 * Claude（呼び出し元LLM）が日本語本文をtool inputとして再生成する過程で
 * 文字が別の字へ置き換わる事故（2026-09-11確認）を構造的に防ぐため、
 * body文字列そのものをtool inputに含めない。呼び出し元は事前にbodyを
 * 許可ディレクトリ配下のファイルへ書き出し、そのファイルパスとSHA256のみを渡す。
 * サーバー側がファイルをUTF-8で直接readし、ハッシュ照合済みの同一バイト列を
 * そのままChatWork APIへ渡す。
 */
export const postRoomMessageFromFileParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body_file_path: z
      .string()
      .min(1)
      .describe(
        'C:\\claude_code\\runtime\\makasete\\fujino\\outbound-body 配下の本文ファイルの絶対パス。' +
          '本文そのものはここには含めない。',
      ),
    expected_sha256: z
      .string()
      .regex(/^[0-9A-Fa-f]{64}$/, 'expected_sha256 must be a 64-char hex string')
      .describe(
        'body_file_pathの内容（UTF-8バイト列）のSHA256ハッシュ（16進64桁）。' +
          'サーバー側で読み込んだバイト列のハッシュと完全一致しない場合はPOSTしない。',
      ),
  })
  .describe(
    '本文をファイル経由で渡すチャットメッセージ投稿（body文字列をtool inputに含めない）',
  );

/** @see https://developer.chatwork.com/reference/put-rooms-room_id-messages-read */
export const readRoomMessagesParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      message_id: z.string().optional().describe('既読にするメッセージID'),
    }),
  })
  .describe('チャットメッセージ既読化');

/** @see https://developer.chatwork.com/reference/put-rooms-room_id-messages-unread */
export const unreadRoomMessageParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      message_id: z.string().describe('未読にするメッセージID'),
    }),
  })
  .describe('チャットメッセージ未読化');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-messages-message_id */
export const getRoomMessageParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
      message_id: z.string().describe('メッセージID'),
    }),
  })
  .describe('チャットメッセージ取得');

/** @see https://developer.chatwork.com/reference/put-rooms-room_id-messages-message_id */
export const updateRoomMessageParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
      message_id: z.string().describe('メッセージID'),
    }),
    body: z.object({
      body: z.string().describe('更新後のメッセージ本文'),
    }),
  })
  .describe('チャットメッセージ更新');

/** @see https://developer.chatwork.com/reference/delete-rooms-room_id-messages-message_id */
export const deleteRoomMessageParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
      message_id: z.string().describe('メッセージID'),
    }),
  })
  .describe('チャットメッセージ削除');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-tasks */
export const listRoomTasksParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    query: z.object({
      account_id: z
        .number()
        .int()
        .optional()
        .describe('タスクの担当者のアカウントID'),
      assigned_by_account_id: z
        .number()
        .int()
        .optional()
        .describe('タスクの依頼者のアカウントID'),
      status: z
        .enum(['open', 'done'])
        .optional()
        .describe('タスクのステータス（open: 未完了, done: 完了）'),
    }),
  })
  .describe('チャットタスク一覧取得');

/** @see https://developer.chatwork.com/reference/post-rooms-room_id-tasks */
export const createRoomTaskParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      body: z.string().describe('タスクの内容'),
      to_ids: z.string().describe('担当者のアカウントID (カンマ区切り)'),
      limit: z.number().int().optional().describe('タスクの期限 (Unix time)'),
      limit_type: z
        .enum(['none', 'date', 'time'])
        .optional()
        .default('time')
        .describe('タスクの期限種別 (none, date, time)'),
    }),
  })
  .describe('チャットタスク作成');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-tasks-task_id */
export const getRoomTaskParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
      task_id: z.number().int().describe('タスクID'),
    }),
  })
  .describe('チャットタスク情報取得');

/** @see https://developer.chatwork.com/reference/put-rooms-room_id-tasks-task_id-status */
export const updateRoomTasksStatusParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
      task_id: z.number().int().describe('タスクID'),
    }),
    body: z.object({
      body: z
        .enum(['open', 'done'])
        .describe('タスクのステータス（open: 未完了, done: 完了）'),
    }),
  })
  .describe('チャットタスクステータス更新');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-files */
export const listRoomFilesParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    query: z.object({
      account_id: z
        .number()
        .int()
        .optional()
        .describe('アップロードしたユーザーのアカウントID'),
    }),
  })
  .describe('チャットファイル一覧取得');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-files-file_id */
export const getRoomFileParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
      file_id: z.number().int().describe('ファイルID'),
    }),
    query: z.object({
      create_download_url: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(0)
        .describe('ダウンロードURLを生成するか (0: しない, 1: する)'),
    }),
  })
  .describe('チャットファイル情報取得');

/** @see https://developer.chatwork.com/reference/get-rooms-room_id-link */
export const getRoomLinkParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
  })
  .describe('チャット招待リンク取得');

/** @see https://developer.chatwork.com/reference/post-rooms-room_id-link */
export const createRoomLinkParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      code: z.string().min(1).max(50).optional().describe('リンクコード'),
      need_acceptance: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(1)
        .describe('承認要否 (0: 不要, 1: 必要)'),
      description: z.string().optional().describe('リンクの説明'),
    }),
  })
  .describe('チャット招待リンク作成');

/** @see https://developer.chatwork.com/reference/put-rooms-room_id-link */
export const updateRoomLinkParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
    body: z.object({
      code: z.string().min(1).max(50).optional().describe('リンクコード'),
      need_acceptance: z
        .number()
        .int()
        .min(0)
        .max(1)
        .default(1)
        .describe('承認要否 (0: 不要, 1: 必要)'),
      description: z.string().optional().describe('リンクの説明'),
    }),
  })
  .describe('チャット招待リンク更新');

/** @see https://developer.chatwork.com/reference/delete-rooms-room_id-link */
export const deleteRoomLinkParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      room_id: z.number().int().describe('ルームID'),
    }),
  })
  .describe('チャット招待リンク削除');

/** @see https://developer.chatwork.com/reference/put-incoming_requests-request_id */
export const acceptIncomingRequestParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      request_id: z.number().int().describe('承認依頼ID'),
    }),
  })
  .describe('コンタクト承認依頼承認');

/** @see https://developer.chatwork.com/reference/delete-incoming_requests-request_id */
export const rejectIncomingRequestParamsSchema = z
  .object({
    account_id: accountIdSchema,
    path: z.object({
      request_id: z.number().int().describe('承認依頼ID'),
    }),
  })
  .describe('コンタクト承認依頼拒否');
