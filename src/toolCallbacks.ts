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
import { z } from 'zod';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

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

/**
 * post_room_message_from_file が読むことを許可するbody fileのroot。
 * 藤野の送信パイプライン（fujino-outbound-pipeline.ps1）が生成する
 * outbound-body配下のみを許可する。
 */
const POST_FROM_FILE_ALLOWED_ROOT =
  'C:\\claude_code\\runtime\\makasete\\fujino\\outbound-body';

/**
 * body fileのサイズ上限（バイト）。
 *
 * ChatWork公式の本文バイト数上限は、本リポジトリ内の情報からは確認できない。
 * したがってこの200,000バイトはChatWork公式の上限値を表すものではなく、
 * ChatWork APIがこのサイズを実際に受理することを保証するものでもない。
 * これは、巨大ファイルを誤ってbody_file_pathに指定した場合の誤送信を防ぐための
 * ローカルな運用上限に過ぎない。値の根拠は、本調査で確認した藤野の実際の
 * BodyFile運用実績（2026-09-11時点で確認した全ファイルが約1,100バイト未満）に対して、
 * 十分な余裕を持たせたという一点のみである。
 */
const POST_FROM_FILE_MAX_BYTES = 200_000;

export class PostRoomMessageFromFileBlockedError extends Error {
  constructor(reason: string) {
    super(`BLOCKED_POST_FROM_FILE: ${reason}`);
    this.name = 'PostRoomMessageFromFileBlockedError';
  }
}

/**
 * body_file_pathが許可されたroot配下の通常ファイルであることを
 * realpathベースで検証し、検証済みの絶対パスを返す。
 *
 * 単純な文字列prefix判定（startsWith）はsymlink/junction経由のroot脱出を
 * 検出できないため使用しない。fs.realpathでallowlist rootとtargetの両方を
 * canonicalizeした上でpath.relativeにより比較する。
 *
 * allowedRoot引数は unit test 専用の内部差し替え口である。
 * public な post_room_message_from_file tool の入力スキーマ
 * （postRoomMessageFromFileParamsSchema）にはallowlist rootを
 * 指定するフィールドが存在しないため、MCP呼び出し側からこの引数を
 * 上書きする経路はない。production実行（postRoomMessageFromFile）は
 * 必ずデフォルト値のPOST_FROM_FILE_ALLOWED_ROOTを使う。
 */
export async function resolveAndValidateBodyFilePath(
  bodyFilePath: string,
  allowedRoot: string = POST_FROM_FILE_ALLOWED_ROOT,
): Promise<string> {
  let realRoot: string;
  try {
    realRoot = await fsPromises.realpath(allowedRoot);
  } catch (err) {
    throw new PostRoomMessageFromFileBlockedError(
      `allowlist root does not exist or is not accessible: ${(err as Error).message}`,
    );
  }

  let realTarget: string;
  try {
    realTarget = await fsPromises.realpath(bodyFilePath);
  } catch (err) {
    throw new PostRoomMessageFromFileBlockedError(
      `body_file_path does not exist or is not accessible: ${(err as Error).message}`,
    );
  }

  // Windowsのパス比較はcase-insensitiveとして扱う。
  const relative = path.relative(
    realRoot.toLowerCase(),
    realTarget.toLowerCase(),
  );

  if (relative === '') {
    // targetがroot自身（ディレクトリ）を指しているケース。ファイルではないため拒否。
    throw new PostRoomMessageFromFileBlockedError(
      'body_file_path resolves to the allowlist root itself, not a file',
    );
  }

  if (
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new PostRoomMessageFromFileBlockedError(
      'body_file_path resolves outside the allowlist root',
    );
  }

  const stat = await fsPromises.stat(realTarget);
  if (!stat.isFile()) {
    throw new PostRoomMessageFromFileBlockedError(
      'body_file_path does not resolve to a regular file',
    );
  }

  return realTarget;
}

/**
 * 検証済みファイルパスから本文を読み込み、サイズ・SHA256・UTF-8妥当性を検証する。
 *
 * 順序を厳守する:
 *   1. statでサイズ確認（0バイト拒否・上限超過拒否）
 *   2. Bufferとして1回だけread
 *   3. readしたBuffer自体の実長でも改めて0byte/上限を再確認
 *      （statとreadの間でファイルが差し替わるTOCTOU的なケースに備える）
 *   4. そのBufferからSHA256を計算し、expected_sha256とcase-insensitive完全一致を確認
 *   5. 同じBufferをTextDecoder('utf-8', { fatal: true })でstrict decode
 * ハッシュ確認後にファイルを再readすることはない。デコード結果はハッシュ計算に
 * 使ったBufferそのものから得られる。
 */
export async function readAndValidateBodyFile(
  realTarget: string,
  expectedSha256: string,
): Promise<string> {
  const stat = await fsPromises.stat(realTarget);

  if (stat.size === 0) {
    throw new PostRoomMessageFromFileBlockedError('body_file_path is empty (0 bytes)');
  }

  if (stat.size > POST_FROM_FILE_MAX_BYTES) {
    throw new PostRoomMessageFromFileBlockedError(
      `body_file_path exceeds size limit (${stat.size} > ${POST_FROM_FILE_MAX_BYTES} bytes)`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = await fsPromises.readFile(realTarget);
  } catch (err) {
    throw new PostRoomMessageFromFileBlockedError(
      `failed to read body_file_path: ${(err as Error).message}`,
    );
  }

  // statとreadFileの間でファイル内容が差し替わった場合に備え、
  // 実際にreadしたBufferの長さでも改めて0byte/上限を確認する。
  if (buffer.length === 0) {
    throw new PostRoomMessageFromFileBlockedError(
      'body_file_path read as empty (0 bytes) despite non-zero stat size',
    );
  }
  if (buffer.length > POST_FROM_FILE_MAX_BYTES) {
    throw new PostRoomMessageFromFileBlockedError(
      `body_file_path buffer exceeds size limit (${buffer.length} > ${POST_FROM_FILE_MAX_BYTES} bytes)`,
    );
  }

  const actualSha256 = createHash('sha256').update(buffer).digest('hex');
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new PostRoomMessageFromFileBlockedError(
      `SHA256 mismatch (expected=${expectedSha256.toLowerCase()} actual=${actualSha256})`,
    );
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let decodedBody: string;
  try {
    decodedBody = decoder.decode(buffer);
  } catch (err) {
    throw new PostRoomMessageFromFileBlockedError(
      `body_file_path is not valid UTF-8: ${(err as Error).message}`,
    );
  }

  return decodedBody;
}

/**
 * 検証済み（SHA256・UTF-8確認済み）の本文文字列を、既存の安全機構
 * （DM write block・room type check）を通した上でChatWorkへPOSTする。
 *
 * ファイルI/Oを一切含まないため、production runtimeのbody fileディレクトリへ
 * 触れずにunit testできる（DM/room safety・account解決・ChatworkClientへ
 * 渡るbodyの結線を検証する対象はこの関数）。MCP toolとしては公開しない
 * （server.tsのtool登録一覧には含まれない）内部関数で、exportはtestからの
 * 直接呼び出しのためだけに行っている。
 */
export async function postMessageBody(
  accountId: string | undefined,
  roomId: number,
  decodedBody: string,
) {
  // account_id は optional（string | undefined）なので、既存の resolveAccountId で
  // canonicalな string へ解決してから、DM write block と ChatworkClient の両方へ
  // 同じ解決済みIDを渡す（checkDirectRoomWriteBlock 内部でも同じ関数で再解決される
  // ため二重解決になるが、常に同じ入力に対して同じキーを返す純粋な解決関数であり、
  // 安全性・キャッシュキーの一貫性に影響はない）。
  const resolvedAccountId = resolveAccountId(accountId);

  // 既存post_room_messageと同じ安全機構（DM write block・room type check）を必ず通す。
  await checkDirectRoomWriteBlock(resolvedAccountId, roomId);

  return chatworkClient(resolvedAccountId)
    .request({
      path: `/rooms/${roomId}/messages`,
      method: 'POST',
      query: {},
      body: { body: decodedBody },
    })
    .then(chatworkClientResponseToCallToolResult);
}

/**
 * post_room_message_from_file の実処理本体。
 *
 * allowedRoot引数は unit test 専用の内部差し替え口である。
 * public な post_room_message_from_file tool の入力スキーマ
 * （postRoomMessageFromFileParamsSchema）にはallowlist rootを指定する
 * フィールドが存在せず、環境変数によるroot override機構も存在しないため、
 * MCP呼び出し側からこの引数を上書きする経路はない。
 * production実行は必ず下記 postRoomMessageFromFile（thin wrapper）経由で
 * POST_FROM_FILE_ALLOWED_ROOT を渡して呼ばれる。
 *
 * 本番と同じ順序（resolve → read/validate → post）で処理するため、
 * unit testはこの関数をisolated temp rootに対して直接呼ぶことで、
 * 「production public handlerが内部で実行する処理列」そのものを
 * production runtimeへ一切書き込まずにend-to-endで検証できる。
 */
export async function postRoomMessageFromFileWithAllowedRoot(
  req: z.infer<typeof postRoomMessageFromFileParamsSchema>,
  allowedRoot: string,
) {
  const realTarget = await resolveAndValidateBodyFilePath(
    req.body_file_path,
    allowedRoot,
  );
  const decodedBody = await readAndValidateBodyFile(
    realTarget,
    req.expected_sha256,
  );

  return postMessageBody(req.account_id, req.path.room_id, decodedBody);
}

/**
 * post_room_message_from_file のpublic MCP handler。
 *
 * production固定rootのみを使う薄いwrapper。allowedRootを外部から
 * 指定・上書きする経路は存在しない（postRoomMessageFromFileWithAllowedRoot
 * のコメント参照）。
 */
export const postRoomMessageFromFile = async (
  req: z.infer<typeof postRoomMessageFromFileParamsSchema>,
) => {
  return postRoomMessageFromFileWithAllowedRoot(
    req,
    POST_FROM_FILE_ALLOWED_ROOT,
  );
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
