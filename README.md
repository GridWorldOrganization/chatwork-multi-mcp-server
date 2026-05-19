# Chatwork MCP Server

AI から Chatwork にメッセージを届けたり、部屋の様子を見に行ったりできる、小さな MCP (Model Context Protocol) サーバーです。

「この部屋にこの内容を送って」「最近のメッセージを確認して」と自然に頼むだけで、AI が Chatwork API とのやり取りを引き受けます。複数アカウントにも対応しているので、投稿するアカウントを切り替えながら、必要なチャンネル操作だけを軽く使えます。

## 使い方

Claude Desktop を例に説明します。

1. Claude Desktop を起動
2. メニューから「設定」をクリック
3. 「開発者」タブをクリック
4. 「構成を編集」をクリック
5. ファイルビューワーで `claude_desktop_config.json` が示されるので、好みのエディタで開く
6. 以下の設定を入力する

```json
{
  "mcpServers": {
    "chatwork": {
      "command": "npx",
      "args": ["@chatwork/mcp-server"],
      "env": {
        "CHATWORK_API_TOKEN": "YOUR_CHATWORK_API_TOKEN"
      }
    }
  }
}
```

今後、MCP に対応した AI ツールが増える可能性があります。使い方を追加してほしいツールがあった場合、あなたのコントリビュートをお待ちしています！
