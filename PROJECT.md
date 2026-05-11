# Clinic Web App Portal 作成プロジェクト

## 目的

複数のGoogle Apps Script Webアプリ、GitHub Pagesアプリ、その他業務用URLを、1つのブラウザ画面から管理・起動できるポータルサイトを作成する。

スタッフにも共有して使ってもらうが、リンクの追加・修正は管理者のみが行う想定。

## 作りたいもの

GitHub Pagesで公開できる、静的なWebポータル。

トップページに各Webアプリへのリンクをカード形式で表示する。

## 必須要件

1. リンクは今後増えるため、HTMLに直接ベタ書きせず、`apps.json` のようなJSONファイルで管理する。
2. JSONに項目を追加するだけで、画面にカードが追加されるようにする。
3. 各カードには以下を表示する。
   - アプリ名
   - 説明
   - カテゴリ
   - 起動ボタン
4. カテゴリで絞り込みできるようにする。
   - 医師用
   - 看護師用
   - 受付用
   - 管理用
   - その他
5. スタッフが見やすいように、スマホ・タブレット・PCで見やすいレスポンシブデザインにする。
6. GitHub Pagesで公開できる構成にする。
7. 管理者だけがGitHub上でJSONを編集する運用を想定する。Web画面からの編集機能は不要。

## ファイル構成案

- `index.html`
- `style.css`
- `script.js`
- `apps.json`
- `README.md`

## apps.json の例

```json
[
  {
    "name": "喘息管理アプリ",
    "description": "喘息患者の経過・FeNO・スパイロ・薬剤情報を管理するアプリ",
    "category": "医師用",
    "url": "https://example.com/asthma",
    "visible": true
  },
  {
    "name": "夜間LINE相談",
    "description": "時間外相談の初期トリアージ用Webアプリ",
    "category": "スタッフ用",
    "url": "https://example.com/line",
    "visible": true
  }
]