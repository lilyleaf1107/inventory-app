// 微信小程序登录 Edge Function
// 功能：接收小程序 code → 换 openid → 查是否已绑定 → 返回登录 token 或 openid
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WX_APPID = Deno.env.get("WX_APPID") ?? "";
const WX_SECRET = Deno.env.get("WX_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // 处理预检请求
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "缺少 code 参数" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. 用 code 换 openid（调用微信接口）
    const wxUrl =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${WX_APPID}` +
      `&secret=${WX_SECRET}` +
      `&js_code=${code}` +
      `&grant_type=authorization_code`;

    const wxRes = await fetch(wxUrl);
    const wxData = await wxRes.json();

    const openid: string | undefined = wxData.openid;
    if (!openid) {
      return new Response(
        JSON.stringify({ error: "微信登录失败: " + (wxData.errmsg || "未知错误") }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. 用 service_role 查 profiles 表，看这个 openid 是否已绑定用户
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("wx_openid", openid)
      .maybeSingle();

    // 查不到 → 未绑定，返回 openid 让前端引导用户先账号密码登录后绑定
    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ action: "bind", openid }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. 已绑定 → 查到该用户的 email → 生成 magic link token 用于免密登录
    const { data: authUserData, error: authError } = await supabase.auth.admin.getUserById(
      profile.id
    );

    if (authError || !authUserData.user?.email) {
      return new Response(
        JSON.stringify({ action: "bind", openid }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: authUserData.user.email,
    });

    // generateLink 失败 → 回退到 bind 流程
    if (linkError || !linkData?.properties?.hashed_token) {
      return new Response(
        JSON.stringify({ action: "bind", openid }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. 返回 token_hash，前端用 verifyOtp 完成登录
    return new Response(
      JSON.stringify({
        action: "login",
        token_hash: linkData.properties.hashed_token,
        openid,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "服务器错误: " + String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
