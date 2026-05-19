# Google Apps Script backend

このフォルダの `Code.gs` を、Googleスプレッドシートに紐づけた Apps Script に貼り付けます。

## 初期設定

1. Googleスプレッドシートを作成します。
2. `拡張機能` → `Apps Script` を開きます。
3. `Code.gs` の内容を貼り付けます。
4. `setupPortalSheet()` を1回実行します。
5. `setAdminToken("任意の長い管理用パスワード")` を1回実行します。
6. `デプロイ` → `新しいデプロイ` → `ウェブアプリ` として公開します。

実行ユーザーは自分、アクセスできるユーザーは運用に合わせて設定してください。

## GitHub Pages側の設定

`portal-config.js` の `appsScriptEndpoint` に、デプロイしたウェブアプリURLを入れます。

```js
window.CLINIC_PORTAL_CONFIG = {
  appsScriptEndpoint: "https://script.google.com/macros/s/xxxxx/exec",
};
```

管理画面 `admin.html` では、同じURLと管理用トークンを入力して「GASから読み込み」「GASへ保存」ができます。
保存後は「GASから読み込み」を押して、スプレッドシートへ反映されたことを確認してください。
