# Android Automation · 本地视觉执行器 0.2（只读诊断增强）

截至 2026-10-19：**可运行脚本已实现，离线测试通过，未在 Redmi 或模拟器运行。**
交付形态是官方 AutoJs6 APK + 单个脚本，不是新编译的 Personal OS 独立 APK。

## 手机上测试（无需 PC）

1. 安装 [AutoJs6 6.7.0 arm64 官方 APK](https://github.com/SuperMonster003/AutoJs6/releases/download/v6.7.0/autojs6-v6.7.0-arm64-v8a-62db1ff8.apk)。
2. 在 AutoJs6 左侧抽屉打开 **Shizuku** 并允许授权。Shizuku 已启动不等于 AutoJs6 已获得授权。不需要打开无障碍或配置 ADB。
3. 下载本目录 `dist/AndroidAutomation.js`，用 AutoJs6 打开/导入并运行。
4. 点“1. 开始本机闭环自测”。Android 截图授权选择 **整个屏幕**，保持该页面前台，不手动触碰测试按钮。
5. 脚本会从截图 OCR 找到随机 `TEST 六位数字`，触控后再次截图，只有两帧都识别到对应 `PASS 六位数字` 才显示 `verified`。
6. 点击“复制最近的诊断报告”查看/反馈结果。再次测试需要退出并重新运行脚本。

系统授权无法由应用代替用户确认。小米如终止后台执行，再按系统提示允许 AutoJs6 后台运行；无需先批量修改系统设置。
APK SHA-256 已与 GitHub Release 的 digest 实际比对一致：
`a4fa5c941aecc4dbb770316e35ac98ae5b0efef5041ac0533dfa826b94595525`。
本项目不修改或重签官方 APK；上游源码、许可和发布说明均在 [AutoJs6](https://github.com/SuperMonster003/AutoJs6/tree/v6.7.0)。

## 星铁只读诊断（先做，不触控）

自测之后退出并重新运行脚本，选择 **“2. 星铁只读截图/识别诊断（绝不点击）”**。
授予截图权限并选择**整个屏幕**，在 15 秒内切到《崩坏：星穹铁道》任意可见页面。
脚本校验 Shizuku 授权与已知包名，采集两帧，检查前台是否切换、全屏尺寸及方向是否一致。
只汇总两次 OCR 文本数量、恰好识别出“设置”的次数、截图与 OCR 延迟；**绝不执行 input tap，也不保存截图或 OCR 原文**。
运行后回到 AutoJs6，通过“复制最近的诊断报告”获得 JSON，主要检查：

- `status: "observed"`：只证明两帧安全观察成功；**不是自测通过，也不是星铁任务完成**。
- `visualSummary.ocrCounts`：两次 OCR 块数。两个零可能代表纯图标界面、识别失败或截图异常，不能直接下结论。
- `visualSummary.targetCounts`：两帧“设置”目标数量；`targetStableUnique` 只表示两帧均识别为唯一目标，尚**不能证明可以安全点击**。
- `frames[].captureMs / ocrMs`：捕获与本地 OCR 的粗略耗时，可作为未来能耗基准前的性能线索。
- `actionCount: 0`：只读模式不请求任何触控。如果不是 0，应停止并反馈。

首次请只跑只读诊断；**单步点击测试须另行主动选择**，避免对星铁主账号产生意外操作。

## 星铁单步试验（显式触控）

先通过自测及只读诊断，退出并重新运行脚本后选择“3. 星铁设置入口单步测试（会点击一次）”。授予全屏截图后，在 **15 秒内**切回星铁的手机菜单，保持中文“设置”入口可见。
程序仅接受国服、B 服、国际服的已列出包名，并且当前文本必须是中文。

识别唯一“设置” → 两次位置稳定检查 → 点击一次 → 最多八次截图轮询。
验证候选关键词为“画面 / 声音 / 音量 / 分辨率 / 帧率”，至少两类连续出现两帧。
这些关键词是初始实验假设，尚未对当前游戏版本验证。
**如果入口只有齿轮图标或文字识别失败，会停止，不猜坐标。** 本版没有图标模板、日常任务、后台虚拟屏或 SRC Python 运行时。
不能把自测通过当作星铁通过，不能把设置页单步通过当作星铁日常自动化通过。

## 实现与边界

- Capture：AutoJs6 MediaProjection 全屏截图，显式复制其缓存图像并回收副本。
- Recognize：内置 ML Kit 中文 OCR，本地处理；复用上游 `ocr.mlkit.detect`，不依赖云 OCR。
- Act：Shizuku `input tap`。前台包名必须一致，坐标直接来自全屏像素，不做未经验证的比例映射。
- Verify：结果必须原先不存在，动作后连续两帧满足语义条件；画面变化或命令返回成功都不单独算成功。
- Safety：一次最多一个动作；注入不确定时不重试。重复目标、低置信度、截图尺寸不符、旋转、过期识别、取消或前台切换均拒绝后续触控。
- Stop：自测页有停止按钮；游戏中可从 AutoJs6 停止脚本。没有全局音量键急停。已提交的单次 input 命令不能撤回。
- Timeout：循环时间预算 45 秒，最多八次结果轮询；底层 OCR/Binder 阻塞不能被此同步调用硬中断，恢复后先检查截止时间并拒绝点击。极端阻塞用 AutoJs6 停止脚本。
- Evidence：诊断保存在 AutoJs6 私有目录，只保留最近一次；记录运行 ID、阶段、请求动作数、尺寸、耗时与 OCR 数量（新增独立 screenshot/OCR 时延）。默认不保存截图、识别原文、UID、原始异常或前台包列表，也没有上传路径。
- Recovery：中途进程终止，下次打开标记 `interrupted`，不自动续点。`actionCount` 是请求次数，不证明输入已到达。
- Evidence limit：截图 API 不提供此适配器可核验的帧时间戳；随机自测标记、结果预先不存在、间隔取样降低旧帧假阳性，但仍需真机检查采集稳定性。手动点击测试按钮也能产生结果，因此验收时不要干预。

## 与 Personal OS 关联

本项目独立维护在 `lse872317312010/android-automation`，不作为 Personal OS 子模块，也不依赖其源码、构建、Vault 或 Agent Protocol。Personal OS 仅是未来可选调用方。
`src/core.js` 接收 capture/foreground/tap 适配接口；AutoJs6 可被 MaaFramework native controller 替换。
`android-automation.run.v1` 是实验性外部运行记录，**不是已实现的 Personal OS 导入接口**。

后续由 Application API 校验已接受的 Task、strategy revision、runId 去重、adapter identity 和证据，
再建立 `Execution` / `Outcome`；执行器不能自行确认策略或直接写入 Vault。
`blocked`、`interrupted`、`action_requested` 都不能映射为 completed。
不伪造既有 `evidence/android` G3 记录。本实验与现有策略 App 的九场景验收分开。

## 代码核实与选型记录

核实 Personal OS main：`a5e39a006fec02fd19c3c2c1966cf6e6b9060d8a`（最近提交 #130）。
检查 README、AndroidManifest、MainActivity 所在原生目录、domain Execution/Outcome 与 device evidence。
现有策略 App 没有 MediaProjection/AccessibilityService/Shizuku 屏幕执行链，设备证据 README 明确未真机验收。

| 上游 | 本次核实 | 采用方式 |
| --- | --- | --- |
| [AutoJs6 6.7.0](https://github.com/SuperMonster003/AutoJs6/releases/tag/v6.7.0) | 下载官方 ARM64 APK 并核对摘要；读 OCR、UI、Shizuku 实现及截图文档 | 当前最小运行时，不 fork APK |
| [MaaFwApp](https://github.com/Aliothmoon/MaaFwApp) | README 明确 Android 9+、Shizuku/root 特权进程、native controller、资源构建期打包、虚拟屏 | 下一阶段完整原生宿主候选；并非 MaaXYZ/MaaFwApp |
| [MaaFramework](https://github.com/MaaXYZ/MaaFramework) | 确认主仓库与 MaaFwApp 引用关系 | 后续图像模板/Pipeline 引擎候选，本次未集成 |
| [StarRailCopilot](https://github.com/LmeSzinc/StarRailCopilot) | README 仍描述 Alas 衍生、模拟器/桌面运行与游戏任务资源 | 保持游戏业务唯一上游，本次不复制其任务逻辑 |

MaaFwApp 的资源是构建时集成，不能假定下载空宿主 APK 就能运行 SRC。
SRC 的 Python 业务不能直接当 Maa Pipeline 导入。本模块只验证执行原语，不承诺已经兼容 SRC。
后续先收集 Redmi 诊断，再根据 OCR 准确率、截图延迟和前台运行稳定性决定推进 MaaFwApp 资源包还是 SRC Android adapter。

## 开发与验收

```sh
node --test test/core.test.cjs
node build.mjs
node --check dist/AndroidAutomation.js
```

离线测试验证控制策略（含只读探测不发送动作、前台变化、旋转、超时、取消），不验证 AutoJs6 Rhino/Android API、权限、实际 OCR 或游戏版本。
真机需至少验证：自测成功、拒绝截图、撤销 Shizuku、切换前台、旋转屏幕、停止脚本、进程中断后重启，以及星铁单步实际后置条件。
当前没有任何一项被宣称已完成。完整游戏自动化、Personal OS 自动回传、稳定 APK 自有签名升级是后续工作。
