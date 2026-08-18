# Clinic Web App Portal

院内Webアプリと業務リンクを、疾患・業務または逐次検索から開く静的ポータルです。

## 画面

- 医師用: `index.html` または `?profile=doctor`。使用中の全サイトを表示します。
- スタッフ用: `?profile=staff`。`staffVisible: true` のサイトだけを表示します。
- 編集用: `admin.html`。本番読込、追加・編集、ゴミ箱、差分確認、GAS保存を行います。

看護師用と閲覧用の管理者ページはありません。「管理者」は表示対象ではなく、編集画面を扱う権限です。

## データ形式

```json
{
  "name": "夜尿症 日誌",
  "description": "夜尿日誌を確認します",
  "group": "夜尿症",
  "purpose": "診察",
  "url": "https://example.com",
  "staffVisible": false,
  "keywords": ["enuresis", "diary"],
  "visible": true
}
```

- `group`: 疾患または業務。左のナビゲーションと一覧の見出しに使います。
- `purpose`: `診察`、`患者入口`、`受付`、`データ確認`、`院内業務`、`その他`。
- `staffVisible`: スタッフページにも表示するとき `true`。医師ページには値に関係なく表示されます。
- `keywords`: 英語、略語、日本語の別名。`enuresis` があれば `e`、`en`、`enu` の途中入力でもヒットします。
- `visible`: `false` はゴミ箱内の項目です。

検索は表示名、説明、グループ、用途、キーワードを対象とし、入力イベントごとに即時更新します。Enterは不要です。空白区切りの複数語はAND検索です。

## 安全な保存

管理画面は本番GASの読込に成功するまで保存ボタンを有効にしません。保存時には追加・変更・ゴミ箱件数を表示し、大幅な件数減少には追加確認を求めます。

GAS側では次を行います。

- 保存前の全データを非表示シート `_portal_backups` へ最大100世代保存
- リビジョン番号による古い画面からの上書き拒否
- Script Lockによる同時保存の直列化
- `restoreBackup(行番号)` による復元（復元直前の状態も先にバックアップ）
- `setupDailyBackupTrigger()` によるGoogle Driveへの日次ファイルコピー

日次コピー先を指定する場合は、スクリプトプロパティへ `BACKUP_FOLDER_ID` を設定するか、`setBackupFolderId("フォルダID")` を別の引数付き関数から呼び出します。

## GAS初期設定・更新

更新順序は必ず **GASバックエンド → GitHub Pages** とします。新しい管理画面は、バックアップ対応GASから `revision` が返らない限り保存を有効にしません。

1. `google-apps-script/Code.gs` を、保存用スプレッドシートに紐づくApps Scriptへ反映します。
2. `setupPortalSheet()` を1回実行します。
3. スクリプトプロパティ `ADMIN_TOKEN` を設定します。
4. ブラウザ向けの **Web app** としてデプロイします。
5. 既存Web appを更新する場合は、種類、実行ユーザー、アクセス対象、既存 `/exec` URLの維持を確認します。
6. 任意で `setupDailyBackupTrigger()` を1回実行します。

詳細は `GAS_OPERATION.md` と `google-apps-script/README.md` を参照してください。

## ローカル確認

```bash
python3 -m http.server 8000
```

`http://localhost:8000/?profile=doctor`、`?profile=staff`、`admin.html` を確認します。
