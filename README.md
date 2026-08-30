# FIELD VAULT · 场站验证库

桌面端 2FA 验证程序 (TOTP/HOTP)。支持调度电脑摄像头、扫描图片、扫描屏幕三种方式识别二维码完成绑定。

- 技术栈: Tauri 2 + React 19 + TypeScript
- 设计语言: ark-ui skill — endfield 家族 × maximal 深度
- 开发: `npm install` 后运行 `npm run tauri dev`

## 工作流约定

- **禁止直接向 main 提交代码**——所有改动一律通过 Pull Request 合入
- 一个 PR 尽量只包含一个 commit（必要时 squash merge）
