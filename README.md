<p align="center">
  <img src="client/public/icons/icon-512.png" width="96" alt="刻度清单图标" />
</p>

<h1 align="center">刻度清单 · TickDone</h1>

<p align="center">本地优先、AI 驱动的任务 / 习惯 / 专注管理应用</p>

<p align="center">
  React 18 · TypeScript · Vite · Express · Capacitor · Electron
</p>

---

## 功能

- **任务管理**：清单、标签、优先级、截止时间、重复任务、提醒、备注、子任务
- **多种视图**：今天、最近 7 天、收件箱、所有任务、智能筛选、看板、日历
- **习惯**：每日打卡、连续天数、最近 4 周热力图、每日提醒、习惯编辑
- **专注**：番茄钟、专注记录、今日专注统计
- **统计**：完成情况、专注时长、清单分布、优先级分布、AI 复盘
- **AI 助手**：自然语言添加任务、拆解子任务、规划今天、生成筛选、整理收件箱、复盘、习惯打卡与提醒
- **多端同步**：自托管同步服务，局域网内电脑与手机同步
- **多端运行**：Windows 桌面端、安卓 App、PWA
- **体验细节**：概览首页、主题色、深浅色、最近删除、离线提示、崩溃保护

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite |
| 本地存储 | IndexedDB，本地优先 |
| 同步服务 | Node.js、Express、文件存储、LWW 增量同步 |
| 桌面端 | Electron 33、electron-builder |
| 安卓端 | Capacitor 7、Android Gradle |
| AI | OpenAI 兼容接口 |

## 目录结构

```text
client/          React 前端 + Capacitor 安卓工程
server/          Express 同步服务与 AI 代理
desktop/         Electron 桌面端
scripts/         图标与开发脚本
release/         本地打包产物（不提交）
```

## 快速开始

需要 Node.js 18+。

```bash
npm install
npm run dev
```

启动后：

- 前端开发地址：`http://localhost:5173`
- 同步服务地址：`http://localhost:8787`

生产模式：

```bash
npm run build
npm start
```

打开 `http://localhost:8787`。

## 桌面端

```bash
cd desktop
npm install
npm run start   # 开发
npm run dist    # 打包 Windows 安装包
```

## 安卓端

需要 JDK 21+ 和 Android SDK。

```bash
cd client
npm run build
npx cap sync android

cd android
./gradlew assembleDebug
```

发布签名需要在 `client/android/keystore.properties` 配置自己的 keystore；仓库不包含签名文件。

## 手机同步

1. 电脑端保持运行（关闭窗口只是收起到托盘）。
2. 手机和电脑连接同一个 Wi-Fi。
3. 电脑端：设置 → 多端同步 → 检测服务端，记下类似 `http://192.168.1.10:8787` 的地址。
4. 手机端：设置 → 多端同步，填写电脑的局域网地址，两端填写相同的同步码。
5. 点“检测服务端”确认在线，再点“立即同步”。

同步码相当于数据空间，建议改成只有自己知道的内容。电脑退出后同步服务会停止。

## AI 配置

在 设置 → AI 助手 中填写任意 OpenAI 兼容接口：

- Base URL：例如 `https://api.deepseek.com/v1`
- API Key：只保存在当前设备
- 模型名称：例如 `deepseek-chat`

安卓端直接连接模型接口；桌面端通过本机服务端代理。也可以在输入框使用自然语言，例如：

- “明天下午 3 点产品评审，高优先级 #设计”
- “帮我建立一个每天早上 8 点阅读 30 分钟的习惯”
- “今天有哪些任务没做完？”

## 数据与隐私

- 任务、习惯、专注记录默认保存在本机
- 不依赖云端账号
- API Key 只保存在当前设备，不写入日志
- 同步使用你填写的自托管服务端

## 下载

安装包发布在 GitHub Releases：

https://github.com/krrehe/kedu-tasks/releases

## License

当前仓库暂未添加开源许可证。如需在其它项目中使用，请先联系作者。
