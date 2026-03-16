#!/usr/bin/env node
/**
 * post-slack.js
 * 週次レポートをSlackに送信するスクリプト
 * 
 * 使用方法:
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/... node scripts/post-slack.js
 * 
 * GitHub Actionsから自動実行されます
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.error('❌ SLACK_WEBHOOK_URL が設定されていません');
  console.error('GitHub Secrets に SLACK_WEBHOOK_URL を設定してください');
  process.exit(1);
}

// レポートファイルを読み込む
const reportPath = path.join(__dirname, '..', 'weekly-report.txt');
let reportText = '';

if (fs.existsSync(reportPath)) {
  reportText = fs.readFileSync(reportPath, 'utf-8');
} else {
  // その場で生成
  const { generateSlackReport } = require('./generate-weekly-report');
  reportText = generateSlackReport();
}

// Slack送信
function postToSlack(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      text: text,
      mrkdwn: true,
      unfurl_links: false
    });

    const url = new URL(WEBHOOK_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 && data === 'ok') {
          console.log('✅ Slackへの送信に成功しました');
          resolve(true);
        } else {
          console.error(`❌ Slack送信エラー: ${res.statusCode} ${data}`);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', err => {
      console.error('❌ ネットワークエラー:', err.message);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

// メイン実行
(async () => {
  try {
    console.log('📤 Slackに週次レポートを送信中...');
    await postToSlack(reportText);
  } catch (err) {
    console.error('送信失敗:', err.message);
    process.exit(1);
  }
})();
