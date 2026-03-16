# 💎 Belle Salon Management OS

エステサロン向け経営管理システム  
**CSV差し替えるだけで全KPI・ランキング・アラートが自動更新されるダッシュボード**

---

## 📋 機能一覧

| 機能 | 内容 |
|---|---|
| 📊 全体KPI | 総売上・新規数・平均単価・契約率 |
| 🏪 店舗別KPI | 店舗ごとの達成率・進捗バー |
| 👤 スタッフKPI | スタッフ別売上・契約率・単価 |
| 🏆 ランキング | 売上・契約率・単価・新規獲得 |
| 💎 LTV管理 | 回数券顧客のLTV・離脱リスク |
| 🚨 アラート | HPB集客アラート・顧客離脱アラート |
| 📋 SVアクション | 自動生成されるマネジメントアクション |
| 📣 Slack通知 | 毎週月曜日に自動レポート送信 |

---

## 📁 ファイル構成

```
/
├── index.html                    ← ダッシュボード本体
├── style.css                     ← デザイン
├── script.js                     ← ロジック・集計
├── README.md                     ← このファイル
│
├── data/
│   ├── sales.csv                 ← 売上データ（毎週更新）
│   ├── targets.csv               ← 目標設定（月初更新）
│   ├── staff_master.csv          ← スタッフマスター
│   └── store_master.csv          ← 店舗マスター
│
├── scripts/
│   ├── generate-weekly-report.js ← レポート生成
│   └── post-slack.js             ← Slack送信
│
└── .github/
    └── workflows/
        └── weekly-report.yml     ← 自動実行設定
```

---

## 🚀 初期セットアップ（初回のみ）

### 1. GitHubリポジトリ作成

1. [GitHub](https://github.com) にログイン
2. 右上「+」→「New repository」をクリック
3. リポジトリ名: `salon-management-os`（任意）
4. **Public** を選択（GitHub Pages無料プランの場合）
5. 「Create repository」をクリック

### 2. ファイルをアップロード

```bash
# コマンドライン（Gitが使える場合）
git clone https://github.com/あなたのユーザー名/salon-management-os.git
cd salon-management-os

# このシステムのファイルを全てコピーして
git add .
git commit -m "initial setup"
git push
```

**GUIでアップロードする場合:**
1. GitHubのリポジトリページを開く
2. 「Add file」→「Upload files」
3. 全ファイル・フォルダをドラッグ&ドロップ
4. 「Commit changes」をクリック

### 3. GitHub Pagesを有効化

1. リポジトリの「Settings」タブをクリック
2. 左メニュー「Pages」をクリック
3. Source: **Deploy from a branch**
4. Branch: **main** / **/(root)**
5. 「Save」をクリック
6. 数分後に `https://あなたのユーザー名.github.io/salon-management-os/` でアクセス可能

### 4. Slack Webhookを設定

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From scratch」
3. App名: `Belle Salon Bot`
4. 「Incoming Webhooks」→「Activate Incoming Webhooks」をON
5. 「Add New Webhook to Workspace」→チャンネル選択
6. Webhook URL をコピー (`https://hooks.slack.com/services/...`)

**GitHub Secretsに設定:**
1. GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」
2. 「New repository secret」をクリック
3. Name: `SLACK_WEBHOOK_URL`
4. Secret: コピーしたWebhook URL
5. 「Add secret」

---

## 📅 週次運用方法（毎週の作業）

### ステップ1: 売上CSVを準備

HPB等のシステムから売上CSVをダウンロードして `data/sales.csv` として保存してください。

**CSVの列順（重要）:**
```
A: 店舗名
B: 東京日
C: 会計日（YYYY-MM-DD形式）
D: 会計時間
E: 会計ID（注文ID）
F: 会計区分
G: 区分
H: カテゴリ
I: 項目名（オンダ判定に使用）
J: 単価
K: 振興数
L: 金額
M: M列（0=消化のみ）
N: 予約担当者
O: 指名
P: 施術担当者（スタッフ名）
Q: お客様名
R: お客様カナ
S: お客様番号（顧客ID）
T: 予約経路
U: 性別
V: 新規再来（「新規」または「再来」）
W: 支払い方法
X: レジ担当者
Y: 親客（店舗名も入力）
Z: Y列店舗名（集計に使用）
```

### ステップ2: GitHubにアップロード

**コマンドライン:**
```bash
cd salon-management-os
git add data/sales.csv
git commit -m "update sales $(date +%Y-%m-%d)"
git push
```

**GUIの場合:**
1. GitHubリポジトリを開く
2. `data/` フォルダをクリック
3. `sales.csv` をクリック
4. 鉛筆アイコン「Edit this file」をクリック
5. 内容を新しいCSVの内容に差し替え
6. 「Commit changes」をクリック

### ステップ3: ダッシュボードを確認

`https://あなたのユーザー名.github.io/salon-management-os/` を開いて確認

---

## 📅 月初作業（目標設定）

### targets.csv の更新

`data/targets.csv` を開いて今月の目標を入力してください。

```csv
month,store,new_target,sales_target,unit_price_target,contract_rate_target,continuation_rate_target
2026-04,大宮(直営),35,550000,15000,60,70
2026-04,川崎(直営),28,450000,14500,55,65
2026-04,池袋(直営),22,380000,13500,50,60
```

| 列名 | 内容 | 例 |
|---|---|---|
| month | 年月（YYYY-MM形式） | 2026-04 |
| store | 店舗名（sales.csvのY列と一致させる） | 大宮(直営) |
| new_target | 新規目標数 | 35 |
| sales_target | 売上目標（円） | 550000 |
| unit_price_target | 平均単価目標（円） | 15000 |
| contract_rate_target | 新規契約率目標（%） | 60 |
| continuation_rate_target | 継続契約率目標（%） | 70 |

---

## 📣 Slack自動レポートについて

- **実行タイミング**: 毎週月曜日 午前9時（JST）
- **内容**: 全体KPI・店舗別進捗・スタッフランキング・アラート・SVアクション
- **手動実行**: GitHub→Actions→「週次サロンレポート自動送信」→「Run workflow」

---

## 🚨 アラート対応方法

### HPB集客アラート（新規目標80%未満）

| 状況 | 推奨アクション |
|---|---|
| 新規数 目標70%未満 | ①HPBクーポンを新規追加/改善 ②写真・説明文を更新 |
| 前週比 -20%以上 | ①口コミキャンペーン ②期間限定クーポン発行 |
| 目標80%未満が継続 | SVが現地確認・HPB掲載を全面見直し |

### 顧客離脱アラート（回数券購入者 未来店）

| 未来店日数 | 対応 |
|---|---|
| 30〜60日 | DM送信（次回予約の促進） |
| 60日以上 | 担当スタッフが電話フォロー |
| 90日以上 | SV確認・特別オファー検討 |

---

## 📋 SVマネジメント運用

SVアクションタブに以下の状況で自動アクションが生成されます：

| KPI異常 | SVアクション |
|---|---|
| 契約率 < 50% | カウンセリング同席・トーク改善 |
| 新規達成率 < 70% | HPBクーポン改善・口コミ促進 |
| 平均単価低下 | 上位メニュー提案強化 |

---

## ❓ よくある質問

**Q: ダッシュボードが表示されない**  
A: GitHub PagesがONになっているか確認してください（Settings→Pages）

**Q: データが更新されない**  
A: ブラウザのキャッシュをクリアしてください（Ctrl+Shift+R）

**Q: CSVをアップロードしたのに数値が変わらない**  
A: CSVの列順が正しいか確認してください。特にV列（新規再来）とZ列（Y列店舗名）が重要です

**Q: Slackに送信されない**  
A: GitHub SecretsのSLACK_WEBHOOK_URLが正しく設定されているか確認してください

**Q: 新しい店舗を追加したい**  
A: store_master.csv に行を追加し、targets.csv にその店舗の目標を追加してください

---

## 📞 サポート

システムの運用に関する質問は管理者にお問い合わせください。
