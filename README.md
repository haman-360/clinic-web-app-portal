# Clinic Web App Portal

複数のGoogle Apps Script Webアプリ、GitHub Pagesアプリ、業務用URLを1つの画面から起動するための静的ポータルです。

## ファイル構成

- `index.html`: 画面本体
- `style.css`: レスポンシブデザイン
- `script.js`: `apps.json` の読み込み、検索、カテゴリ絞り込み
- `apps.json`: 表示するアプリ一覧
- `admin.html`: URL登録、並び替え、JSON出力を行う管理ツール
- `admin.js`: 管理ツールの動作
- `PROJECT.md`: プロジェクト要件

## アプリを追加する方法

`apps.json` に次の形式で項目を追加します。

```json
{
  "name": "アプリ名",
  "description": "スタッフに表示する説明",
  "category": "医師用",
  "url": "https://example.com",
  "profiles": ["doctor", "nurse"],
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

## 職員別トップページを作る方法

URLに `profile` を付けると、指定した職員・役割向けのリンクだけを表示できます。

```text
https://example.github.io/clinic-web-app-portal/?profile=doctor
https://example.github.io/clinic-web-app-portal/?profile=nurse
https://example.github.io/clinic-web-app-portal/?profile=reception
https://example.github.io/clinic-web-app-portal/?profile=admin
```

各リンクをどのトップページに表示するかは、`apps.json` の `profiles` で管理します。

```json
{
  "name": "受付用QR作成",
  "description": "受付スタッフが使うQR作成ページ",
  "category": "受付用",
  "url": "https://example.com",
  "profiles": ["reception", "admin"],
  "visible": true
}
```

`profile` を付けずにアクセスした場合は、表示中の全リンクが表示されます。
この仕組みは表示を分けるためのものです。重要なリンクは、Google Apps ScriptやGoogle Driveなどリンク先側でもアクセス制限してください。

## 管理ツールでURLを追加・並び替えする

`admin.html` を開くと、ブラウザ上でURLの追加、表示対象の選択、並び替えができます。

```text
https://example.github.io/clinic-web-app-portal/admin.html
```

管理ツールで作った内容は、ブラウザ内の下書きとして保存されます。
「トップページでプレビュー」を押すと、下書きの内容で `index.html?draft=1` を確認できます。

GitHub Pagesだけでは、ブラウザから直接 `apps.json` を書き換えることはできません。
本番に反映する場合は、管理ツールで出力したJSONを `apps.json` の内容として更新してください。

## ローカル確認

`fetch` で `apps.json` を読み込むため、直接HTMLファイルを開くのではなく簡易サーバーで確認します。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

## GitHub Pagesで公開する

1. このリポジトリをGitHubにpushします。
2. GitHubのリポジトリ設定で `Settings` → `Pages` を開きます。
3. `GitHub Actions` を選びます。
4. 発行されたURLにアクセスします。
