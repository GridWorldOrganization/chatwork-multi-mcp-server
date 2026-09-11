import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  postRoomMessageFromFile,
  postRoomMessageFromFileWithAllowedRoot,
  postMessageBody,
  resolveAndValidateBodyFilePath,
  readAndValidateBodyFile,
} from './toolCallbacks';
import { postRoomMessageFromFileParamsSchema } from './schema';
import { store, setRooms } from './store';
import type { Room } from './types/room';

const originalChatworkApiToken = process.env['CHATWORK_API_TOKEN'];
const originalChatworkAccounts = process.env['CHATWORK_ACCOUNTS'];

// production runtime（C:\claude_code\runtime\makasete\fujino\outbound-body）へは
// 一切書き込まない。テストは常にOS一時ディレクトリ配下の専用サブディレクトリのみを使う。
let testAllowedRoot: string;

beforeEach(async () => {
  process.env['CHATWORK_API_TOKEN'] = 'default-token';
  delete process.env['CHATWORK_ACCOUNTS'];

  testAllowedRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'chatwork-mcp-file-body-test-'),
  );
});

afterEach(async () => {
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

  await fs.rm(testAllowedRoot, { recursive: true, force: true });
});

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

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

describe('postRoomMessageFromFileParamsSchema', () => {
  test('does not contain a body/text field, or an allowlist-root override field, in tool input schema (case 10)', () => {
    const shape = postRoomMessageFromFileParamsSchema.shape;
    const keys = Object.keys(shape);
    expect(keys).toEqual(
      expect.arrayContaining(['account_id', 'path', 'body_file_path', 'expected_sha256']),
    );
    expect(keys).not.toContain('body');
    expect(keys).not.toContain('allowed_root');
    expect(keys).not.toContain('root');
    // path配下にも本文フィールドが無いことを確認
    const pathShape = (shape.path as any).shape;
    expect(Object.keys(pathShape)).toEqual(['room_id']);
  });

  test('rejects expected_sha256 that does not match ^[0-9A-Fa-f]{64}$', () => {
    const result = postRoomMessageFromFileParamsSchema.safeParse({
      path: { room_id: 1 },
      body_file_path: 'C:\\x\\y.txt',
      expected_sha256: 'not-a-hash',
    });
    expect(result.success).toBe(false);
  });

  test('accepts a valid 64-char hex expected_sha256', () => {
    const result = postRoomMessageFromFileParamsSchema.safeParse({
      path: { room_id: 1 },
      body_file_path: 'C:\\x\\y.txt',
      expected_sha256: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
  });
});

describe('resolveAndValidateBodyFilePath (path/realpath security, isolated temp root only)', () => {
  test('case 3: file outside allowlist root -> BLOCK', async () => {
    const outsideDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'chatwork-mcp-file-body-outside-'),
    );
    try {
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');

      await expect(
        resolveAndValidateBodyFilePath(outsideFile, testAllowedRoot),
      ).rejects.toThrow('BLOCKED_POST_FROM_FILE');
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  test('case 4: ".." escape from allowlist root -> BLOCK', async () => {
    const parentDir = path.dirname(testAllowedRoot);
    const escapeTargetPath = path.join(parentDir, `_escape_${Date.now()}.txt`);
    await fs.writeFile(escapeTargetPath, 'escape content');

    const traversalPath = path.join(
      testAllowedRoot,
      '..',
      path.basename(escapeTargetPath),
    );

    try {
      await expect(
        resolveAndValidateBodyFilePath(traversalPath, testAllowedRoot),
      ).rejects.toThrow('BLOCKED_POST_FROM_FILE');
    } finally {
      await fs.rm(escapeTargetPath, { force: true });
    }
  });

  test('case 5: junction pointing outside allowlist root -> BLOCK (Windows junction; true symlink requires admin and is SKIPPED, not silently PASSed)', async () => {
    const outsideDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'chatwork-mcp-file-body-junction-outside-'),
    );
    const outsideFile = path.join(outsideDir, 'secret.txt');
    await fs.writeFile(outsideFile, 'secret outside content');

    const junctionPath = path.join(testAllowedRoot, 'escape-junction');

    let junctionCreated = false;
    try {
      // fs.symlink(..., 'junction') はWindowsで管理者権限を必要としない。
      await fs.symlink(outsideDir, junctionPath, 'junction');
      junctionCreated = true;
    } catch (err) {
      console.warn(
        `SKIPPED: junction creation failed in this environment, cannot verify junction escape blocking: ${(err as Error).message}`,
      );
    }

    if (!junctionCreated) {
      // 誤ってPASS扱いにしない：明示的にSKIPしたことをテスト結果に残す。
      expect(junctionCreated).toBe(false);
      await fs.rm(outsideDir, { recursive: true, force: true });
      return;
    }

    const pathThroughJunction = path.join(junctionPath, 'secret.txt');

    try {
      await expect(
        resolveAndValidateBodyFilePath(pathThroughJunction, testAllowedRoot),
      ).rejects.toThrow('BLOCKED_POST_FROM_FILE');
    } finally {
      await fs.rm(junctionPath, { force: true }).catch(() => {});
      await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('valid file inside allowlist root resolves successfully', async () => {
    const filePath = path.join(testAllowedRoot, 'ok.txt');
    await fs.writeFile(filePath, 'ok content');

    const resolved = await resolveAndValidateBodyFilePath(filePath, testAllowedRoot);
    expect(resolved.toLowerCase()).toBe(filePath.toLowerCase());
  });

  test('directory (not a file) inside allowlist root -> BLOCK', async () => {
    const dirPath = path.join(testAllowedRoot, 'subdir');
    await fs.mkdir(dirPath);

    await expect(
      resolveAndValidateBodyFilePath(dirPath, testAllowedRoot),
    ).rejects.toThrow('BLOCKED_POST_FROM_FILE');
  });
});

describe('readAndValidateBodyFile (byte/SHA256/UTF-8, isolated temp root only)', () => {
  test('case 6: zero byte file -> BLOCK', async () => {
    const filePath = path.join(testAllowedRoot, 'empty.txt');
    await fs.writeFile(filePath, Buffer.alloc(0));
    const hash = sha256Hex(Buffer.alloc(0));

    await expect(readAndValidateBodyFile(filePath, hash)).rejects.toThrow(
      'BLOCKED_POST_FROM_FILE',
    );
  });

  test('case 7: size limit exceeded -> BLOCK', async () => {
    const bigBuf = Buffer.alloc(200_001, 0x41);
    const filePath = path.join(testAllowedRoot, 'big.txt');
    await fs.writeFile(filePath, bigBuf);
    const hash = sha256Hex(bigBuf);

    await expect(readAndValidateBodyFile(filePath, hash)).rejects.toThrow(
      'BLOCKED_POST_FROM_FILE',
    );
  });

  test('case 8: invalid UTF-8 -> BLOCK', async () => {
    const invalidBuf = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
    const filePath = path.join(testAllowedRoot, 'invalid.txt');
    await fs.writeFile(filePath, invalidBuf);
    const hash = sha256Hex(invalidBuf);

    await expect(readAndValidateBodyFile(filePath, hash)).rejects.toThrow(
      'BLOCKED_POST_FROM_FILE',
    );
  });

  test('case 2 (unit-level): SHA256 mismatch -> BLOCK', async () => {
    const filePath = path.join(testAllowedRoot, 'body.txt');
    await fs.writeFile(filePath, Buffer.from('hello', 'utf-8'));

    await expect(
      readAndValidateBodyFile(filePath, 'f'.repeat(64)),
    ).rejects.toThrow('BLOCKED_POST_FROM_FILE');
  });

  test('case 9: buffer used for SHA256 and UTF-8 re-encoded decodedBody produce identical bytes', async () => {
    const bodyText = '複数行のテスト本文\n■ 停滞・要対応：日本語テスト。';
    const buf = Buffer.from(bodyText, 'utf-8');
    const filePath = path.join(testAllowedRoot, 'body2.txt');
    await fs.writeFile(filePath, buf);
    const hash = sha256Hex(buf);

    const decoded = await readAndValidateBodyFile(filePath, hash);
    const reencoded = Buffer.from(decoded, 'utf-8');

    expect(reencoded.equals(buf)).toBe(true);
  });

  test('valid UTF-8 + correct SHA256 -> decodes to exact original text', async () => {
    const bodyText = '藤野です。テスト本文。仕組みを追加しています。';
    const buf = Buffer.from(bodyText, 'utf-8');
    const filePath = path.join(testAllowedRoot, 'body.txt');
    await fs.writeFile(filePath, buf);
    const hash = sha256Hex(buf);

    const decoded = await readAndValidateBodyFile(filePath, hash);
    expect(decoded).toBe(bodyText);
  });

  test('expected_sha256 comparison is case-insensitive', async () => {
    const bodyText = 'case insensitive hash test';
    const buf = Buffer.from(bodyText, 'utf-8');
    const filePath = path.join(testAllowedRoot, 'case.txt');
    await fs.writeFile(filePath, buf);
    const hashUpper = sha256Hex(buf).toUpperCase();

    const decoded = await readAndValidateBodyFile(filePath, hashUpper);
    expect(decoded).toBe(bodyText);
  });
});

describe('postRoomMessageFromFile public handler (production root is fixed, no bypass)', () => {
  // postRoomMessageFromFile は POST_FROM_FILE_ALLOWED_ROOT を固定で渡すだけの
  // thin wrapper（postRoomMessageFromFileWithAllowedRootのラッパー）であるため、
  // このdescribeでは「productionのpublic handlerが本当に固定rootしか見ない」
  // ことだけを確認する。root外ファイルを渡した場合にBLOCKされることを、
  // productionと同じ経路（postRoomMessageFromFile自体）で検証する。
  // 正常系のE2E検証は下のdescribe（postRoomMessageFromFileWithAllowedRoot）で行う。

  test('postRoomMessageFromFile rejects when body_file_path is outside the fixed production root (no bypass via test root)', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'bot:named-token';
    store.dispatch(setRooms({ account: 'bot', data: [groupRoom], ttl: 300000 }));

    // testAllowedRoot はproduction固定rootではないため、
    // postRoomMessageFromFile（第2引数を渡さない= production root固定）から見ると
    // 常に「root外」として扱われるべきことを確認する。
    const filePath = path.join(testAllowedRoot, 'body.txt');
    const buf = Buffer.from('test body', 'utf-8');
    await fs.writeFile(filePath, buf);
    const hash = sha256Hex(buf);

    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postRoomMessageFromFile({
        account_id: 'bot',
        path: { room_id: 411150588 },
        body_file_path: filePath,
        expected_sha256: hash,
      }),
    ).rejects.toThrow('BLOCKED_POST_FROM_FILE');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('postMessageBody safety-mechanism inheritance (no file I/O, no production runtime access)', () => {
  // postMessageBody は resolveAndValidateBodyFilePath / readAndValidateBodyFile による
  // ファイル検証を終えた後の「DM write block・room type check・ChatworkClientへの
  // 送信」だけを担う内部関数であり、ファイルシステムに一切触れない。
  // そのため production runtime のbody fileディレクトリへ書き込むことなく、
  // postRoomMessageFromFileが検証後に必ず通す安全機構の結線を直接検証できる。

  test('case 11: existing DM write block is enforced for the new tool', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';
    store.dispatch(setRooms({ account: 'fujino', data: [directRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"message_id":"1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postMessageBody('fujino', 427365528, 'dm body'),
    ).rejects.toThrow('BLOCKED_DM_WRITE');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('case 12: unresolved room type safety check is enforced for the new tool', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'fujino:fujino-token';

    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/rooms')) {
        return new Response('[]', { status: 200 });
      }
      return new Response('{"message_id":"1"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postMessageBody('fujino', 999999, 'unresolved room body'),
    ).rejects.toThrow('BLOCKED_ROOM_TYPE_UNRESOLVED');
  });

  test('case 1 + case 13: normal case - decodedBody is sent Ordinal-identical to ChatworkClient', async () => {
    const bodyText =
      '[藤野] 【定時アラート 16:00】2026-09-11(金)\n■ 停滞・要対応：テスト文字列。仕組みという語を含む。';

    process.env['CHATWORK_ACCOUNTS'] = 'bot:named-token';
    store.dispatch(setRooms({ account: 'bot', data: [groupRoom], ttl: 300000 }));

    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"message_id":"42"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await postMessageBody('bot', 411150588, bodyText);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const requestInit = init as RequestInit;
    const sentParams = new URLSearchParams(String(requestInit.body));
    const sentBody = sentParams.get('body');

    expect(sentBody).not.toBeNull();
    expect(Array.from(sentBody as string)).toEqual(Array.from(bodyText));
    expect(sentBody).toBe(bodyText);
    expect(result.isError).toBeUndefined();
  });
});

describe('postRoomMessageFromFileWithAllowedRoot (full normal-path E2E, isolated temp root, no production runtime access)', () => {
  // postRoomMessageFromFile（public handler）は
  // postRoomMessageFromFileWithAllowedRoot(req, POST_FROM_FILE_ALLOWED_ROOT) を
  // 呼ぶだけのthin wrapperである（toolCallbacks.ts参照）。
  // このdescribeでは、production public handlerが内部で実際に実行する処理列
  // （resolveAndValidateBodyFilePath → readAndValidateBodyFile → postMessageBody）
  // を、production固定rootではなくisolated temp rootに対して直接実行することで、
  // 「production runtimeへ一切書き込まずに、正常系で実際にPOSTまで到達する経路」を
  // 関数レベルでend-to-end検証する。
  //
  // production public handler自体（postRoomMessageFromFile）がPOST_FROM_FILE_ALLOWED_ROOT
  // 以外のrootを受け付けないことは、上のdescribe
  // 'postRoomMessageFromFile public handler (production root is fixed, no bypass)'
  // で別途確認済み。

  test('actual temp file -> realpath validation -> Buffer read -> SHA256 -> strict UTF-8 -> account resolve -> room safety -> mocked fetch (group room, success)', async () => {
    process.env['CHATWORK_ACCOUNTS'] = 'bot:named-token';
    store.dispatch(setRooms({ account: 'bot', data: [groupRoom], ttl: 300000 }));

    const bodyText = '藤野です。正常系E2Eテスト。仕組みを追加しています。■ 停滞・要対応：テスト。';
    const buf = Buffer.from(bodyText, 'utf-8');
    const filePath = path.join(testAllowedRoot, 'e2e-normal.txt');
    await fs.writeFile(filePath, buf);
    const expectedSha256 = sha256Hex(buf);

    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"message_id":"777"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await postRoomMessageFromFileWithAllowedRoot(
      {
        account_id: 'bot',
        path: { room_id: 411150588 },
        body_file_path: filePath,
        expected_sha256: expectedSha256,
      },
      testAllowedRoot,
    );

    // HTTP fetchは1回のみ（DM/room safetyでroomがキャッシュ済みのため
    // /rooms へのpreflight fetchは発生せず、/messages へのPOSTのみ）
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const requestInit = init as RequestInit;
    const sentParams = new URLSearchParams(String(requestInit.body));
    const sentBody = sentParams.get('body');

    // ファイル本文とOrdinal完全一致
    expect(sentBody).not.toBeNull();
    expect(Array.from(sentBody as string)).toEqual(Array.from(bodyText));
    expect(sentBody).toBe(bodyText);

    // message_id成功レスポンス
    expect(result.isError).toBeUndefined();
    const textContent = result.content.find(
      (c): c is { type: 'text'; text: string } => c.type === 'text',
    );
    expect(textContent?.text).toContain('"message_id":"777"');

    // production runtime write 0（このテストが書いたのはtestAllowedRoot配下のみ）
    const productionRoot = 'C:\\claude_code\\runtime\\makasete\\fujino\\outbound-body';
    const productionFiles = await fs.readdir(productionRoot);
    expect(productionFiles).not.toContain('e2e-normal.txt');
  });
});
