# Clinic Web App Portal

複数のGoogle Apps Script Webアプリ、GitHub Pagesアプリ、業務用URLを1つの画面から起動するための静的ポータルです。

## ファイル構成

- `index.html`: 画面本体
- `style.css`: レスポンシブデザイン
- `script.js`: `apps.json` の読み込み、検索、カテゴリ絞り込み
- `apps.json`: 表示するアプリ一覧
- `PROJECT.md`: プロジェクト要件

## アプリを追加する方法

`apps.json` に次の形式で項目を追加します。

```json
{
  "name": "アプリ名",
  "description": "スタッフに表示する説明",
  "category": "医師用",
  "url": "https://example.com",
  "visible": true
}
```

`category` は次のいずれかを推奨します。

- `医師用`
- `看護師用`
- `受付用`
- `管理用`
- `その他`

`visible` を `false` にすると画面には表示されません。

## ローカル確認

`fetch` で `apps.json` を読み込むため、直接HTMLファイルを開くのではなく簡易サーバーで確認します。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

## GitHub Pagesで公開する

1. このリポジトリをGitHubにpushします。
2. GitHubのリポジトリ設定で `Settings` → `Pages` を開きます。
3. `Deploy from a branch` を選び、公開したいブランチの `/root` を指定します。
4. 発行されたURLにアクセスします。
