<div align="center">
  <img src="logo.png" alt="AnimaI T2I Logo" width="400" />
</div>

# AnimaI T2I v2

画像生成AIのプロンプトをクリックだけで構築できるツールです。**単一HTMLファイル**で動作し、サーバー不要。

Danbooruタグ文化に基づく**モデル別プロンプト最適化**(Illustrious / NoobAI / Animagine)に対応しています。

## 起動方法

- **配布版**: `dist/AnimaI.html` をダブルクリックするだけ(全機能内蔵・単一ファイル)
- **開発版**: ルートの `index.html` をブラウザで開く(`prompts-data.js` が必要)

## 主な機能

| 機能 | 説明 |
|---|---|
| モデルプリセット | Illustrious XL / NoobAI XL / Animagine XL 4.0 / カスタム の推奨品質タグ・ネガティブをワンクリック適用。⚙️ボタンで編集可 |
| 自動ソートエンジン | 選択タグをモデル別の最適順(主体→キャラ→レーティング→容姿→衣装→構図→背景→品質→年代)に自動並び替え |
| レーティング自動挿入 | NSFWトグルに連動して `safe` / `nsfw` を自動挿入(設定でOFF可) |
| 重み構文 | 選択タグチップの +/− で `(tag:1.2)` 形式の重みを調整 |
| トークンカウンタ | CLIP 77トークン上限の概算をリアルタイム表示・警告 |
| 複数キャラ | 最大3キャラのスロット分割 → `BREAK` 区切りで出力(Forge Couple / REGION対応) |
| おまかせ生成 🎲 | カテゴリ単位のランダム抽選。🔒ロックしたタグは引き継ぎ |
| 検索 | 日本語・英語の部分一致でタグを絞り込み |
| お気に入り | localStorage保存 + JSONエクスポート/インポート |

## タグデータの編集

`csv/` フォルダのCSVを編集します。形式:

```csv
Japanese,Prompt,weight(省略可)
女の子1人,1girl
ロングヘア,long hair,1.2
```

- 2列目にカンマ区切りで複数タグを指定可能
- 日本語名に `/` を含めると対応する英語に自動分割
- `n_` 接頭辞のファイルはNSFWタブ、`negative` を含むファイルはネガティブタブに分類

### カテゴリ構成

| カテゴリ | 内容 |
|---|---|
| 人物 / 髪型 / 髪色 / 表情 | キャラの基本属性(髪型と髪色は独立選択) |
| 服装 / アクセサリー・小物 | 衣装・持ち物(武器も含む) |
| ポーズ / シチュエーション / 構図・カメラ | 身体と画面 |
| 背景・場所 / 背景様式 | 「教室」等の場所と「白背景」等の様式を分離 |
| 効果 / 画風 / 品質 / 年代 / レーティング | 仕上げ |
| NSFW 7カテゴリ | 基本設定・体形・表情・ポーズ・シチュエーション・同性愛・道具(NSFWトグルで表示。同性愛カテゴリはやおい/ゲイ/バラ/百合などの同性愛限定タグと男×男・女×女の複合タグを集約) |

### ビルド

CSVを編集したら以下を実行して `prompts-data.js` と `dist/AnimaI.html` を再生成:

```bash
python3 build.py
```

### テスト

```bash
npm install            # 初回のみ (jsdom)
npm test               # logic 40件 + DOM 30件
npm run audit          # CSV監査(重複・欠落・表記ゆれ)
```

## 使用技術

- HTML/CSS/JS (Vanilla — 依存関係なし)
- Python 3 (ビルドスクリプトのみ)
- Node.js + jsdom (テストのみ)

## プロンプト設計の参考

- Illustrious XL 公式推奨タグ構成 (OnomaAI Research)
- Animagine XL 4.0 モデルカード (CaglistroLab, HuggingFace)
- NoobAI XL 推奨品質タグ (Civitai コミュニティ)
