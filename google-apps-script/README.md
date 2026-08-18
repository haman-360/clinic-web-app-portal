# Google Apps Script backend

`Code.gs` はポータルの本番データ、保存前バックアップ、競合防止を管理します。

## 初期設定

1. 保存用Googleスプレッドシートの `拡張機能` → `Apps Script` を開きます。
2. `Code.gs` を反映します。
3. `setupPortalSheet()` を実行します。
4. スクリプトプロパティに `ADMIN_TOKEN` を設定し、`checkAdminTokenSetting()` で確認します。
5. **Web app** としてデプロイします。

既存データの7列形式は、`purpose`、`keywords`、`staffVisible` を加えた10列形式へ自動拡張されます。旧データは読み込み時に新形式へ変換されます。

## バックアップ

本番保存の直前に、使用中・ゴミ箱を含む全データが `_portal_backups` シートへ保存されます。シートは誤編集防止のため非表示で、直近100世代を保持します。

復元する場合はシートを再表示して対象行を確認し、Apps Scriptエディタから次のような引数付き補助関数を実行します。

```js
function restoreSelectedBackup() {
  return restoreBackup(12);
}
```

復元前の現在データも自動でバックアップされます。

Google Driveへスプレッドシート全体を毎日コピーする場合は、`setupDailyBackupTrigger()` を1回実行します。保存先フォルダを指定する場合はスクリプトプロパティ `BACKUP_FOLDER_ID` を設定します。

## デプロイ時の必須確認

- 種類: Web app
- 実行ユーザー: 意図した所有者
- アクセスできるユーザー: 現行運用と同じ対象
- 既存 `/exec` URL: 原則維持

デプロイ後は実際の `/exec` URLを開き、JSONに `ok: true`、`apps`、`revision` が含まれることを確認します。
