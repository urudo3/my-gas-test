/**
 * Cloudflare Workers: D1 API Bridge
 * * 役割: ブラウザ等のクライアントと D1 データベースの中継。
 * セキュリティ: 現時点では開発優先のため、送られた SQL をそのまま実行する構成。
 *              ただし SELECT 文のみ許可。
 */
export default {
  async fetch(request, env) {
    // 1. CORS ヘッダーの設定 (ブラウザからのアクセスを許可)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    // 2. プリフライトリクエスト (OPTIONS) への即時応答
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      // 3. リクエストボディから SQL とパラメータを抽出
      // 期待する形式: { "sql": "SELECT * FROM ...", "params": [1, "text"] }
      const { sql, params = [] } = await request.json();
      if (!sql) {
        throw new Error("SQL statement is required.");
      }
      // 4. SELECT 文以外を拒否
      if (!/^\s*SELECT\b/i.test(sql)) {
        return new Response(JSON.stringify({ error: "Only SELECT statements are allowed." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // 5. D1 データベース (yt_data) に対してクエリを実行
      // env.yt_data は wrangler.toml で設定した binding 名
      const { results } = await env.yt_data
        .prepare(sql)
        .bind(...params)
        .all();
      // 6. 結果を JSON 形式で返却
      return new Response(JSON.stringify(results), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      // エラー発生時のレスポンス
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }
  },
};
