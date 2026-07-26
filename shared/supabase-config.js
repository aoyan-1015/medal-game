// オンラインランキング用のSupabase設定。
// Supabaseでプロジェクトを作成し、Project Settings → API に表示される
// Project URL と anon public キーをそのまま下に貼り付けてください。
// (anon keyはRLS=Row Level Securityで保護される前提の公開キーで、秘密の
// キーではありません。安全性はテーブルのRLSポリシー側で担保します。)
//
// url がこのファイルのプレースホルダーのままだと、ranking.js はオンライン
// ランキング機能を自動的に無効化します（他の機能には影響しません）。
window.SUPABASE_CONFIG = {
  url: "PASTE_YOUR_SUPABASE_URL_HERE",
  anonKey: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
};
