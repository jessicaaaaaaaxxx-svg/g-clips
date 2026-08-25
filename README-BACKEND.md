# G Clips 后端部署说明（Supabase + Railway）

本项目现在包含三部分：

1. **官网**（根目录 `index.html` 等）— 纯静态营销页面，无需改动。
2. **创作者中心**（`/dashboard`）— 创作者登录、上传视频、查看收益、申请提现。
3. **管理后台**（`/admin`）— 视频审核、账户库管理、提现审核、平台数据总览。

后端由两部分组成：

- **Supabase**：Postgres 数据库 + 用户鉴权（Auth）+ 视频文件存储（Storage）。
- **Express API**（`/server`）：处理需要权限校验的业务逻辑（审核、结算、提现处理等），部署在 Railway。

---

## 第一步：创建 Supabase 项目

1. 前往 [supabase.com](https://supabase.com)，创建一个新项目（选择离你的用户最近的区域）。
2. 项目创建完成后，进入 **SQL Editor**，新建一个查询，粘贴 [supabase/schema.sql](supabase/schema.sql) 的全部内容并运行。
   - 这会创建所有数据表（`profiles`、`douyin_accounts`、`videos`、`earnings_ledger`、`withdrawals`）、行级安全策略（RLS）、触发器，以及 6 条示例抖音账户种子数据。
3. 进入 **Storage**，新建一个名为 `videos` 的 Bucket，**不要**勾选 Public（保持私有）。
4. 回到 SQL Editor，把 `supabase/schema.sql` 文件末尾被注释掉的 Storage 策略（`storage.objects` 相关的三条 `create policy`）取消注释后单独运行一次（必须在 Bucket 创建之后才能成功，所以文件里默认是注释状态）。
5. 进入 **Project Settings → API**，记录下：
   - `Project URL`
   - `anon public` key
   - `service_role` key（⚠️ 高权限密钥，只用于服务器端，绝不能出现在前端代码或提交到 Git）

## 第二步：创建第一个管理员账号

1. 打开本地或部署后的 `/dashboard/login.html`，用你自己的邮箱注册一个账号（走"注册"流程）。
2. 回到 Supabase 的 SQL Editor，运行（把邮箱换成你刚注册的邮箱）：
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. 之后就可以用这个邮箱在 `/admin/login.html` 登录管理后台了。

## 第三步：本地运行（可选，用于开发调试）

```powershell
npm install
Copy-Item .env.example .env
# 编辑 .env，填入 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
npm start
```

再编辑 [shared/config.js](shared/config.js)，填入：
```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://你的项目.supabase.co",
  SUPABASE_ANON_KEY: "你的-anon-key",
  API_BASE_URL: "", // 本地同源运行时留空即可
};
```

打开 `http://localhost:3000` 即可看到官网；`http://localhost:3000/dashboard/login.html` 是创作者登录；`http://localhost:3000/admin/login.html` 是管理员登录。

## 第四步：部署到 Railway

1. 把整个项目推送到一个 GitHub 仓库。
2. 在 [railway.app](https://railway.app) 新建项目，选择 "Deploy from GitHub repo"，选中这个仓库。
3. Railway 会自动识别根目录的 `package.json` 并运行 `npm install && npm start`。
4. 在 Railway 项目的 **Variables** 里添加环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOWED_ORIGIN`（同源部署可以先填 `*`，正式上线建议填你的域名）
5. 部署完成后，Railway 会给你一个形如 `https://your-app.up.railway.app` 的域名。
6. 因为 Express 同时托管了官网、创作者中心和管理后台的静态文件，`shared/config.js` 里的 `API_BASE_URL` 保持空字符串 `""` 即可（同源请求）。把 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 也一并填好，然后把这一份改动连同代码一起提交部署。

## 目录结构一览

```
G Clips/
├─ index.html, styles.css, script.js, i18n.js   # 官网（不变）
├─ package.json, .env.example                    # Express 服务配置
├─ server/                                        # Express API（Railway 部署入口）
│  ├─ index.js
│  ├─ supabaseAdmin.js
│  ├─ middleware/ (auth.js, requireAdmin.js)
│  ├─ lib/balance.js
│  └─ routes/ (videos.js, accounts.js, earnings.js, withdrawals.js, admin.js)
├─ supabase/schema.sql                            # 数据库结构、RLS、种子数据
├─ shared/                                        # 前后台共用：配置、Supabase 客户端、通用样式
│  ├─ config.js  ← 部署后需要手动填入 Supabase 项目信息
│  ├─ app-core.js
│  └─ app.css
├─ dashboard/                                      # 创作者中心
│  ├─ login.html, auth.js
│  └─ index.html, dashboard.js
└─ admin/                                          # 管理后台
   ├─ login.html, auth.js
   └─ index.html, admin.js
```

## 功能范围

**创作者中心**：注册/登录、上传视频（存入 Supabase Storage）、查看播放量/预估收益/结算记录、查看已分配的抖音账户、申请提现、查看提现历史。

**管理后台**：平台数据总览、视频审核（通过/拒绝/更新播放数据/结算收益）、创作者列表、抖音账户库管理（新增/分配/释放）、提现审核（批准/拒绝/标记已支付）。

## 安全说明

- `SUPABASE_SERVICE_ROLE_KEY` 拥有绕过 RLS 的完全权限，只能配置在 Railway 的环境变量里，绝不能写进前端代码（`shared/config.js` 里只放 `anon` key，这是设计上安全、允许公开的）。
- 所有需要权限校验的操作（审核、结算、分配账户、处理提现）都必须经过 Express API 的 `authenticate` + `requireAdmin` 中间件，不允许前端直接用 anon key 操作这些表。
- 数据库本身也开启了 RLS 作为第二层防护，即使 API 出现漏洞，普通用户也无法越权读取或修改他人数据。
