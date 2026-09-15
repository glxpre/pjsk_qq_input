# PJSK 贴纸伴侣（桌面版）

Windows QQ 的 Project SEKAI 贴纸伴侣：在你聊天时用现有贴纸素材生成带文字的图片，
支持预览、复制和插入 QQ。**只有启动本程序时功能才生效**，退出后不残留后台服务。

复用仓库已有的 React 18 + TypeScript + Vite 7 + Material UI + Canvas 代码：
贴纸素材、`characters.json` 模板数据、本地字体、绘制约定（296×256 逻辑画布、
中心对齐、模板锚点）全部沿用，只是额外增加了一个**独立的桌面构建模式**，
不改动原有网页与 toy 平台逻辑。

---

## 1. 当前 QQ 版本的能力实测结论（重要）

在 **QQ 9.9.20.36580（QQNT / Electron 版）** 上实测：

| 能力 | 结果 |
| --- | --- |
| 识别前台 QQ 窗口 | ✅ 可以（`Chrome_WidgetWin_1`，进程名 `QQ`） |
| 通过 UI Automation 访问 QQ 内部控件 | ❌ **不行**：QQ 的 UIA 树只暴露 2 个节点（窗口 + `Intermediate D3D Window`），没有 Edit/Document，也没有 ValuePattern |
| 读取输入框已提交文本 | ❌ 不可用 |
| 获取文本变化事件 | ❌ 不可用 |
| 区分输入框 / 搜索框 / 聊天记录 | ❌ 无法从 UIA 区分 |
| 粘贴 PNG 到 QQ | ✅ 可行（走系统剪贴板 + Ctrl+V） |

作为对照，同一台机器上 Edge（同样是 Chromium）的 UIA 树有 **418 个节点、31 个
可编辑元素**，说明探测方法本身有效、并不是权限或代码问题。QQ 是主动关闭了
Chromium 的无障碍支持。

**因此本程序把「实时模式」标记为不可用，默认交付快捷键兼容模式**，
并且**没有**把它描述成已实现实时读取。程序不做任何猜测：

- 不收集全局按键拼聊天内容（无法正确处理输入法、删除、粘贴、光标编辑）；
- 不注入 QQ 进程、不修改 QQ 文件、不使用非官方协议；
- 不假设 QQ 的内部 DOM 或私有接口。

如果某个 QQ 版本确实开放了 UIA，程序会自动识别并启用实时模式的代码路径（见第 5 节），
无需改代码。

---

## 2. 两种工作模式

### 2.1 快捷键兼容模式（当前 QQ 版本下的默认交付）

1. 在 QQ 输入框里输入文字，**选中**要转成贴纸的部分；
2. 按 `Ctrl+Shift+D`（可修改；若该组合已被别的程序占用，程序会自动换用可用组合
   并在界面上写明）——程序**只发送一次 Ctrl+C**并读取剪贴板；
3. 程序校验剪贴板**确实发生了变化**，且内容不为空、不等于复制前的旧内容，
   才会采用；否则提示「请手动复制后粘贴到本程序」，**绝不会误用剪贴板里的旧内容**；
4. 右侧预览生成结果，按 `Ctrl+Alt+S` 或点「插入到 QQ」把图片放进输入框；
5. **由你自己按 QQ 的发送设置发送**——程序不接管 Enter，不自动发送。

也可以完全不用快捷键：直接在程序左侧的文本框里打字或粘贴。

安全约束（全部已实现）：

- 只发送**一次** Ctrl+C，不持续模拟 `Ctrl+A`/`Ctrl+C`；
- 不读取整个系统剪贴板历史，只在本次操作中做一次前后对比；
- 不默认全选 QQ 窗口内容（不会把聊天记录复制出来，也不会破坏输入状态）；
- 没有做「剪贴板备份—恢复」：恢复可能覆盖你后来复制的新内容，所以宁可不做；
- 你点击「复制图片」之后，剪贴板里保留的就是图片本身，方便你手动粘贴。

### 2.2 实时模式（仅在 QQ 开放 UIA 的版本上生效）

当辅助进程报告 `liveReadSupported: true` 时，程序按设计启用：

- 选择角色/模板并记住上次选择；
- QQ 输入框获得焦点时读取已提交草稿；
- 文本变化后按**可配置的防抖**（默认 500ms）生成；
- 用**不抢焦点**的预览展示；继续输入时只展示最新文本的结果，旧任务不会覆盖新结果；
- 输入框为空/只有空白时不生成；切换聊天、切换应用、暂停联动时取消旧任务并清除预览。

**在 QQ 9.9.20 上这些路径没有被实测通过**，请以第 7 节的「尚未实测」清单为准。

---

## 3. 长文本处理

要求是**保留原文**：不摘要、不删字、不改写、不静默截断。排版基于**实际渲染尺寸**
（`Canvas measureText` + 真实角色 alpha 边界），不是「超过几个字就缩小」。

排版策略（由 `src/layout/autoLayout.ts` 实现，45 项单元测试覆盖）：

| 情况 | 行为 |
| --- | --- |
| 短文本 | 保留模板原有字号、颜色、位置、倾斜；合适时单行 |
| 中等长度 | 自动换成 2～3 行，优先保持可读字号；保留你显式输入的换行 |
| 中英混排 | 中文按**字素**边界断行，英文优先按**单词**断行 |
| 超长单词 / URL | 必要时按字素断行（emoji、代理对、组合字符不会被拆开） |
| 标点 | 避免句号、逗号等落在行首；行首禁则 + 行尾禁则 |
| 仍放不下 | 逐级/二分缩小字号，下限默认 **22px**（可配置） |
| 到下限还放不下 | 扩展画布：**上方独立文字区 + 下方角色图** |
| 超过单张容量 | 按句子 → 标点 → 字素边界拆成多张，同一模板、原文连续片段 |
| 超过张数上限 | 默认 6 张；超过时提示「分批生成 / 返回编辑」，**剩余文字不丢弃** |

其它保证：

- `result.originalText` 与每个 `page.text` 都是原文的**精确切片**，
  所有页面拼接起来 === 原文（有专门测试）；
- 自动排版产生的换行只存在于 `page.render.lines`，**不会污染原文**；
- 页码只显示在预览界面（「第 1/3 张」），**不写进贴纸正文**；
- 排版优先横排；模板倾斜放不下时**明确回退横排并给出提示**，不输出被裁切的文字；
- 字体和图片就绪后才允许导出；资源加载失败会显示错误，不会把占位画面导出成贴纸。

---

## 4. 开发、构建与打包命令

### 环境要求

- Windows 10/11 x64
- Node.js 20+（本机验证：24.19.0）
- .NET Framework 4.x（Win10/11 自带；辅助程序用它自带的 `csc.exe` 编译，**不需要**
  下载 .NET SDK，也不需要联网）

### 安装依赖

```powershell
npm install
```

> 注意：`package.json` 里有一个 GitHub 依赖 `@25-ji-code-de/sekai-auth`。
> 如果 `git`/网络不可用导致安装失败，桌面功能本身只依赖
> `react` / `react-dom` / `@mui/*` / `vite` / `esbuild` / `electron`，
> 可以先装这些再单独处理该依赖。

### 一键构建

```powershell
npm run desktop:build      # 编译辅助程序 + 三个 bundle + 复制素材
```

产物：

```
desktop-dist/main/main.cjs         Electron 主进程
desktop-dist/main/preload.cjs      隔离桥
desktop-dist/renderer/index.html   React UI
desktop-dist/assets/               788 张贴纸 + characters.json + 图标
desktop-dist/helper/QqHelper.exe   Windows 辅助程序
```

### 开发调试

```powershell
npm run desktop:dev        # 启动渲染进程 dev server（默认 http://localhost:9001）
# 另开一个终端，把地址传给 Electron：
$env:SEKAI_DESKTOP_DEV_SERVER="http://localhost:9001"; npx electron .
```

### 直接运行（不打包）

```powershell
npm run desktop:start      # 构建后 electron .
```

### 打包

```powershell
npm run desktop:pack       # 便携版目录：release/PJSK-Sticker-Companion-win-x64/
npm run desktop:dist       # NSIS 安装包 + 便携版 exe（需要管理员或开发者模式）
```

`desktop:pack` 不依赖 `electron-builder` 的代码签名步骤：本机既没有管理员权限也没有
开启开发者模式，`electron-builder` 解压 `winCodeSign` 时会因为里面包含 macOS 的
符号链接而失败（`Cannot create symbolic link : 客户端没有所需的特权`），
而这台机器上那些文件与本程序毫无关系。因此 `scripts/package-portable.mjs` 手工组装
同样的目录结构（Electron 运行时 + `resources/app/{main,renderer}` +
`resources/assets` + `resources/helper`），双击即用、免安装、免管理员、免联网。

### 自检（推荐在打包后执行）

```powershell
npm run desktop:smoke          # 对 release/ 里的便携版跑一遍端到端自检
npm run desktop:smoke -- --dev # 对仓库里的 electron 运行时自检
```

自检会真正启动程序，然后逐项验证并打印报告：

- 已打包标志、Electron 版本、实际使用的资源目录；
- `characters.json` 是否能加载、788 张贴纸是否都在、托盘图标是否存在；
- 两个全局快捷键能否注册（被别的程序占用会如实列出）；退出时是否释放；
- 辅助程序路径、QQ 是否在运行、版本号、实时读取是否可用及原因；
- 渲染进程：模板数量、字体是否就绪、素材是否解码成功、alpha 边界；
- **六种典型文本的真实排版实拍**：短句 / 中文长句 / 中英混排 / emoji / 多行 /
  超长文本，逐项给出张数、行数、字号、策略、原文是否完整、分页是否连续、
  字符是否被截断、每行实测宽度是否超出画布、单次排版耗时、真实绘制的文字像素数；
- Chromium 日志中的错误行（CSP 拦截、模块加载失败、渲染进程崩溃等）。

报告同时写入 `--smoke-out=` 指定的 JSON 文件（默认在临时目录），
并在应用卡住时保留已完成的**进度报告**，便于定位。

### 按用户方式启动一次（交互启动检查）

```powershell
npm run desktop:run            # 真实创建窗口与托盘，观察 12 秒后结束
npm run desktop:run -- --dev --seconds 20
```

自检用的是隐藏窗口，这一条补上前台启动路径：窗口/托盘是否真的建起来、
进程是否稳定存活、启动日志里有没有 CSP 或模块加载错误、结束后进程是否归零。

### 单独验证 QQ 接入能力

```powershell
npm run desktop:helper:test
```

输出包含前台窗口、QQ 版本、UIA 元素数量、是否支持实时读取以及原因。

```powershell
# 排查“快捷键没反应”：列出本机哪些组合可用（不修改任何设置）
.\node_modules\electron\dist\electron.exe tools\probe-shortcuts.cjs

# 不启动程序，直接看排版引擎在六种文本上的决策与实测行宽
node tools/diag-layout.ts
node tools/diag-layout.ts --art=full --lines 1 "想排版的文字"
```

### 全部检查

```powershell
npm run type-check           # 网页/共享代码
npm run desktop:type-check   # 桌面代码
npm test                     # 4 个测试文件
npm run lint
npm run build                # 原有网页构建（未改动）
npm run build:toy            # 原有 toy 构建（未改动）
npm run desktop:smoke        # 打包后自检
```

---

## 5. 架构

```
desktop/
  helper/
    QqHelper.cs             C# / .NET + UI Automation 辅助进程（只读）
    build-helper.ps1        用系统自带 csc.exe 编译，并做 ping 自检
    test-helper.ps1         端到端跑一遍所有 op，打印可读报告
  main/
    main.ts                 窗口 / 托盘 / 全局快捷键 / IPC / app:// 协议 / 退出清理
    config.ts               设置持久化（纯函数可测；不保存草稿与历史）
    qqHelper.ts             辅助进程客户端（NDJSON over stdio）
    clipboardBridge.ts      剪贴板竞态处理与插入状态机
    smoke.ts                自检时收集主进程侧事实（路径 / 快捷键 / 辅助进程）
    preload.cjs             contextBridge 白名单 API
  renderer/
    App.tsx                 桌面 UI（文本框 / 模板 / 设置 / 预览 / 动作）
    stickerRenderer.ts      测量 + 排版 + 绘制（纯函数，可测）
    assets.ts               素材基址（Electron 下走 app://，浏览器下走 dev server）
    smoke.ts                渲染进程自检：真实加载素材、字体、排版并绘制
    useFontsReady.ts        字体就绪门控
    preview.html / preview.ts   不抢焦点的实时预览浮窗
    index.html / index.css / fonts/

src/layout/
  segment.ts                字素/词/禁则字符分类（无 DOM 依赖）
  autoLayout.ts             排版引擎（无 DOM 依赖）

scripts/
  build-desktop.mjs         main+preload (esbuild) + renderer (Vite)
  copy-desktop-assets.mjs   素材与辅助程序复制
  package-portable.mjs      手工组装便携版目录（绕开需要符号链接权限的签名步骤）
  smoke-desktop.mjs         打包后自检：启动真实程序、校验资源、打印排版实拍

tools/
  qq-probe.ps1              只读 UIA 探测（判断某个程序能否被实时读取）
  probe-shortcuts.cjs       列出本机可用的全局快捷键组合
  diag-layout.ts            排版决策诊断（不需要 QQ、不需要界面）
```

设计要点：

- **辅助进程与主进程通过受控 IPC 通信**（NDJSON 请求/响应，带请求 id 与超时）；
  辅助程序不可用时程序照常工作，并如实报告 `available: false`。
- **资源路径**：主进程注册 `app://assets/` 协议，把渲染进程对素材的请求映射到
  安装目录下的真实文件。这样渲染进程用正常的 `fetch`/`<img>` 即可，
  同时在 `file://` 下也能工作，且**离线可用**。
  资源目录是**探测**出来的（`resources/assets` → `desktop-dist/assets`），
  因为把路径写死会在打包后静默丢掉全部贴纸和托盘图标。
- **绘图核心抽取**：`src/layout/autoLayout.ts` 只依赖一个 `measureText` 接口，
  在 Electron 渲染进程里继续用浏览器 Canvas 和本地字体，没有重写图像引擎。
- **打包时资源路径**：贴纸图片与辅助程序通过 `extraResources` 放到
  `resources/assets/img` 与 `resources/helper/`，主进程按顺序
  `resources/helper` → `desktop-dist/helper` → 仓库内 `desktop/helper/bin` 查找。
- **测量缓存与分页搜索**：排版引擎对 `measureText` 结果按「字体 + 文本」记忆，
  并把「放宽禁则后的重试」从线性回退改成二分。341 字的长草稿在真实 Canvas 上
  从 14.4 秒降到 0.55 秒（`npm run desktop:smoke` 会打印每个样例的耗时）。
- **界面防抖**：排版在最后一次输入后 180ms 才重算，长草稿连续打字不会卡住光标。

---

## 6. 生命周期与桌面体验

- 未启动程序时：没有 QQ 联动、没有快捷键、没有辅助进程。
- 启动后按保存的设置启用联动；界面与托盘都有**明显的启用/暂停开关**。
- 托盘：打开主窗口、暂停/启用、显示 QQ 检测状态、退出。
- **关闭窗口按钮 = 完全退出**；「最小化到托盘」是单独的操作（设置页与托盘菜单），
  不会出现「以为退出了其实还在后台」。
- 完全退出时：注销全局快捷键、取消任务、结束辅助进程。
- 不安装开机启动项，不注册后台服务。
- 重复启动只激活已有实例（`requestSingleInstanceLock`）。
- 快捷键冲突会被检出并**自动换用可用组合**，并在界面、托盘提示里说明换了什么：
  `Control+Alt+D` 在普通 Windows 桌面上经常已被别的常驻程序占用
  （本机实测：`Control+Alt+D`、`Control+Alt+Z/X/C/M`、`Super+Alt+S/D` 都被占用），
  因此读取选区的默认值改为 `Control+Shift+D`，并保留一串备选组合按序尝试。
- PNG 默认**透明背景**，设置里可切换**白底**以处理 QQ 的兼容问题。
- 默认**不记录也不上传**任何 QQ 草稿；生成历史需要你主动打开（`recordHistory`），
  即使打开也只写在本机 `userData` 目录。

设置项：模板、插入快捷键、读取选区快捷键、防抖、最小字号、最大行数、张数上限、
导出倍数、透明/白底、是否扩展画布、是否避免遮挡角色、是否记录历史。

---

## 7. 测试结果与尚未实测的项目

### 已通过的自动化测试（共 95 项）

```
npm test
  test/legacy-migration.test.mjs   9 通过   （仓库原有）
  test/autoLayout.test.ts         51 通过   （排版引擎）
  test/desktopRenderer.test.ts    20 通过   （桌面绘制与模板桥接）
  test/desktopMain.test.ts        15 通过   （设置与剪贴板竞态）
```

排版引擎覆盖：短句保留模板样式、中文长句换行、中英混排、emoji/ZWJ/区域指示符
不被拆开、多行显式换行、最小字号、最大行数、标点禁则、超长无空格 token、
拆图后原文完整性、页码不进正文、超出张数上限不丢字、旋转包围盒、字距、
描边参与排版、确定性、空输入、颜色/字体覆盖，
以及**满画布角色图下每一页仍被填满**、**必须压到角色上时也不会超出画布**。

桌面部分覆盖：contain 适配与 alpha 边界、模板锚点与颜色、样式覆盖、
设置透传、排版不遮挡角色、多张渲染各自的切片、画布尺寸（含扩展后的高度）、
文字按行高落位、描边、白底与透明、缺少底图时仍渲染文字、
设置归一化与越界钳制、损坏配置回退、配置不落盘草稿、
复制/粘贴的三态区分、粘贴前目标复检。

### 已在本机实测

- ✅ 用系统 `csc.exe` 编译 `QqHelper.exe` 并通过 ping 自检；
- ✅ 辅助程序实测本机 QQ 9.9.20.36580：正确报告 QQ 在运行、版本号、
  `liveReadSupported: false` 及原因；
- ✅ `npm run type-check`（网页/共享）与 `npm run desktop:type-check`（桌面）均无错误；
- ✅ `npm run lint`（整仓库，0 error / 0 warning）；
- ✅ `npm run build` 与 `npm run build:toy`：原有网页与 toy 构建均成功，
  未受桌面改动影响；
- ✅ `npm run desktop:build` 产出全部 bundle 与素材；
- ✅ **便携版打包成功并实机自检通过**（`npm run desktop:pack` +
  `npm run desktop:smoke`）：`release/PJSK-Sticker-Companion-win-x64/`
  直接启动，788 个模板全部加载、本地字体就绪、贴纸素材解码成功、
  六个样例全部「原文完整 / 分页连续 / 字符未截断 / 未超出画布 / 缓存稳定」，
  退出后辅助进程归零、快捷键已释放；
- ✅ 六种文本的真实排版实拍（同一台机器、同一份 296×256 模板）：

  | 样例 | 输入 | 结果 | 策略 |
  | --- | --- | --- | --- |
  | 短句 | `初音未来` | 1 张 / 1 行 / 38px（模板字号） | 沿用模板 |
  | 中文长句 | 39 字 | 1 张 / 3 行 / 22px，画布扩到 296×386 | 上方文字带 |
  | 中英混排 | 62 字 | 2 张 / 每张 3 行 / 22px | 分页 |
  | emoji | 18 字 | 1 张 / 2 行 / 31px，画布扩到 296×362 | 上方文字带 |
  | 多行 | 3 行显式换行 | 1 张 / 3 行 / 38px，画布扩到 296×472 | 上方文字带 |
  | 超长 | 341 字 | 6 张（上限 6）/ 每张 3 行 / 22px，全文约需 11 张，剩余未丢弃 | 超上限提示 |

  每一项都附带实测行宽（例如 288/288/290px，画布宽 296px），
  用来证明没有裁切；这些数字由 `npm run desktop:smoke` 每次重新测量。

### 需要在真实 QQ 中验证（本次未实测，不得视为已通过）

1. **实时模式全流程**（读取草稿、防抖、小浮窗预览、旧任务不覆盖新结果、
   切换聊天/应用时取消）——当前 QQ 版本没有开放 UIA，因此**未实测**。
2. **中文输入法候选阶段**是否会被误当成最终文字——实时模式未实测，
   兼容模式不受影响（只读取你明确选中的已提交文本）。
3. **QQ 中粘贴 PNG 的实际表现**：透明背景与白底各是什么效果、
   是否被压缩、是否显示为图片而不是文件名。代码已把两种都做出来，
   但没有在真实聊天窗口里逐一验证。
4. **光标中间编辑 / 删除 / 粘贴输入**后按快捷键读取——逻辑上只取选区，
   未在真实 QQ 中逐项验证。
5. **在断网的干净机器上**安装并运行（构建产物全部本地、CSP 禁止任何远程加载、
   `app://` 协议只读本地文件，但没有在物理断网的机器上装过）。
6. **多显示器 / DPI 缩放**下预览窗口与插入行为。
7. **NSIS 安装包**：`npm run desktop:dist` 需要管理员权限或开发者模式
   （原因见「打包」一节），本机未生成安装包，只有免安装目录版。

### 本次未完成

- `npm run desktop:dist`（NSIS 安装包）未能在本机完成：`electron-builder` 解压
  `winCodeSign` 需要创建符号链接的特权，本机既无管理员权限也未开启开发者模式。
  便携版已用 `scripts/package-portable.mjs` 完整交付并通过自检；
  需要安装包时，以管理员身份运行 `npm run desktop:dist` 即可。

---

## 8. 用户使用说明

1. 启动 `PJSK-Sticker-Companion.exe`（免安装：解压 `release/PJSK-Sticker-Companion-win-x64/`
   后双击；开发模式下是 `npm run desktop:start`）。
2. 左侧选择「模板」标签页挑角色/贴纸；选择会被记住。
3. 两种输入方式：
   - 在 QQ 里选中文字 → 按 `Ctrl+Shift+D` → 程序读取选区并生成；
   - 或直接在左侧「贴纸文字」框里输入/粘贴。
4. 右侧预览。多张时点击「第 1/3 张」切换；状态区会说明用的是模板字号、
   缩小到多少、是否扩展了画布、为什么回退横排。
   如果启动时发现快捷键被别的程序占用，程序会自动换一个可用组合，
   并在右侧用蓝色提示条写清楚换成了什么。
5. 把光标放回 QQ 输入框 → 按 `Ctrl+Alt+S`（或点「插入到 QQ」）：   - 程序会**先确认 QQ 输入框仍是当前焦点**，不是就只复制图片并提示，
     绝不会插到错误的窗口；
   - 然后写入剪贴板并发送一次 Ctrl+V；
   - 结果分三态显示：**已复制** / **已发送粘贴请求** / **已在 QQ 中确认**。
     「已发送粘贴请求」不等于已发送消息。
6. 也可以用「复制图片」「保存 PNG」，多张时可「复制全部」「批量保存」。
7. 关闭窗口即完全退出；想让它继续待命就点「最小化到托盘」。
8. 退出后：快捷键注销、辅助进程结束、不再有任何联动。

---

## 9. 许可

沿用仓库许可：AGPL-3.0-only。
