# FIELD VAULT · 场站验证库

桌面端 2FA 验证程序（TOTP/HOTP），支持三种二维码来源完成绑定：**电脑摄像头**、**图片**（拖放 / 粘贴 / 选择）、**屏幕捕获**（系统选源 + 应用内拖拽框选区域精扫）。

设计语言：ark-ui skill — **endfield 家族 × maximal 深度**（纸白/炭黑双主题、信号黄动作系统、契形倒计时仪表、工程网格舞台分层），双语界面（中文主体 + 英文微标签）。

## 功能

| 模块 | 说明 |
|---|---|
| 验证器库 | 实时 TOTP 码（30/60s）、契形倒计时（临界闪烁）、HOTP 计数递增、搜索 |
| 扫描台 | 摄像头实时取景 / 图片拖放+Ctrl+V / 屏幕捕获+拖拽框选 / **手动输入文本密钥或粘贴 otpauth 链接**；Google Authenticator 迁移码批量导入 |
| 令牌风格 | 标准 TOTP/HOTP（6/8 位）+ **Steam Guard 5 字符码**（issuer 含 Steam/Valve 自动识别） |
| Steam 导入 | **自动扫描本机** Steam Desktop Authenticator（.maFile）/ steamguard-cli（steamguard.json）数据文件导入令牌；识别 Steam 客户端登录账号（loginusers.vdf）；仅导入 shared_secret |
| 保险库 | 主密码加密（PBKDF2 600k + AES-256-GCM）或明文模式（首启自选）；恢复密钥（一次性展示，忘记密码可重设主密码） |
| 备份 | 密码加密备份导出（复制 JSON）/ 导入合并（自动去重） |
| 系统集成 | 托盘常驻（可在设置关闭，关闭后 X 即退出）、复制后 N 秒自动清空剪贴板 |
| 主题 | endfield 纸白（官方基准）/ endfield 炭黑反转，一键切换 |

## 开发运行

```bash
npm install
npm run tauri dev
```

- 依赖：Node ≥ 20、Rust（MSVC）、Windows 10/11（WebView2 预装）
- 首次 Rust 编译较慢（约 5–15 分钟，已配置 crates.io 清华源加速）
- 数据存放：`%APPDATA%/com.zxymiku.fieldvault/`（`vault.json` + `settings.json`）

## 构建发布版（compile / build）

前置条件与 `tauri dev` 相同：Rust（MSVC 工具链）+ Node ≥ 20；安装器制作工具（NSIS / WiX）由 Tauri 在首次打包时自动下载。

```bash
# 一条命令完成：前端构建 (tsc + vite) → Rust release 编译 → 打包安装器
npm run tauri build
```

产物位置（版本号以 `tauri.conf.json` 为准）：

| 产物 | 路径 |
|---|---|
| 绿色单文件 exe（可直接运行） | `src-tauri/target/release/field-vault.exe` |
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/FIELD VAULT_0.1.0_x64-setup.exe` |
| MSI 安装包 | `src-tauri/target/release/bundle/msi/FIELD VAULT_0.1.0_x64_en-US.msi` |

常用变体：

```bash
# 只出绿色 exe，跳过安装器打包（最快，不下载 NSIS/WiX）
npm run tauri build -- --no-bundle

# 只要 NSIS 安装包，跳过 MSI（省去 WiX 下载）
npm run tauri build -- --bundles nsis
```

说明：

- 首次 release 编译约 10–20 分钟（dev 缓存不共用；已配置 crates.io 清华源加速依赖下载）
- 升版本号需同步改三处：`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`package.json`
- 构建过程即发布校验：`npm run build`（`tsc && vite build`）失败会中断打包
- 交叉编译：Windows 产物在 Windows 上构建即可；如需 macOS/Linux 版本需在对应平台执行同一命令

## 浏览器降级模式（QA）

`npm run dev` 后访问 `http://localhost:1420` 可在纯浏览器中运行 UI（无 Tauri IPC 时自动降级 localStorage），便于界面调试与自动化测试；摄像头/屏幕捕获/托盘为 Tauri/WebView2 专属能力。

## 安全模型

- **加密模式**：账户数据由随机主密钥 AES-256-GCM 加密；主密钥分别被「主密码派生密钥」与「恢复密钥派生密钥」封装（双密钥槽位）。磁盘文件无密码/恢复密钥不可读。
- **忘记主密码**：凭初始化时一次性展示的恢复密钥解锁并重设主密码；两者皆失只能重置保险库（删除全部数据重新初始化）。
- **明文模式**：首启可显式选择，界面有风险警示；任何本机程序可读取密钥。
- 剪贴板自动清除默认 15 秒，可调 0–300 秒或关闭。

## Steam 本机导入说明

官方 Steam PC 客户端**不存储**可生成令牌的密钥（Steam Guard 密钥只在手机 App 或第三方桌面验证器中）。「自动扫描本机」搜索以下位置：

- 、（递归）与 Steam Desktop Authenticator 安装目录下的 
-  与 
- （仅读取登录账号名用于身份确认）

注意：已加密的 maFile 需先在原工具中解密；（交易确认密钥）不会被导入。

## 已知限制

- WebView2 摄像头权限一次拒绝后不会再次弹窗——需删除 `%LOCALAPPDATA%/com.zxymiku.fieldvault/EBWebView/` 复位（应用内错误提示有说明）
- 屏幕扫描每次会弹出系统选源对话框（浏览器安全规范要求用户激活）
- 密钥（secret）在账户档案中默认模糊遮罩，可显隐切换

## 工作流约定

- **禁止直接向 main 提交代码**——所有改动一律通过 Pull Request 合入
- 一个 PR 尽量只包含一个 commit（必要时 squash merge）

## 技术栈

Tauri 2 · React 19 · TypeScript · Vite · jsQR · WebCrypto（自研 TOTP/HOTP/vault-crypto，无重型依赖）
