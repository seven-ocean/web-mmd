# web-mmd 项目架构 / 功能模块梳理

> 目标：在浏览器里实时播放/编辑 MMD（PMX/PMD + VMD/VPD），支持多种相机与运行模式，并提供多人协作（WebRTC + Firestore 信令）。

## 1. 技术栈与运行形态

- 框架：Next.js（App Router），React（Client Components 为主）
- 渲染：three.js + @react-three/fiber（Canvas 场景），@react-three/drei（相机/加载等）
- 后期：@react-three/postprocessing + 自研 Pass（含 HexDoF、NormalBlending 等）
- WebGPU：three/webgpu + 对应 EffectComposer/Node 版后期链路（实验性）
- 动画/编辑：theatre.js（相机 Editor Mode 时间轴/镜头编辑）
- 物理：ammojs-typed（RootLayout 初始化），three-stdlib（MMDPhysics、GrantSolver 等）
- UI：
  - Leva：调参 GUI（右侧面板/自动隐藏）
  - MUI：Main UI（资源管理抽屉/弹窗）
  - media-chrome：音频控制条（作为播放时间轴来源）
- 多人：Firebase Firestore（信令/在线用户），WebRTC DataChannel（多路通道：信令通道 + 业务通道）
- 存储：localforage（IndexedDB），自定义 zustand persist 中间件
- 测试：Playwright（E2E）

构建/部署形态：
- `next.config.ts` 设置 `output: 'export'` + `assetPrefix`，面向静态站点部署（GitHub Pages 风格）。
- Webpack 增加 `raw-loader` 以便直接加载 `.vert/.frag` shader 文件。

## 2. 入口与顶层装配

### 2.1 Next App Router

- `app/layout.tsx`：全局布局，初始化 Ammo 物理库（只在浏览器端执行）
- `app/page.tsx`：主页面
  - 挂载 `<Canvas>`（WebGL/WebGPU 二选一）
  - 叠加 UI：LoadingOverlay、ControlBar、Leva Panel、MainUI（资源抽屉）、Multiplayer、QRCodeOverlay 等

### 2.2 渲染世界（ThreeWorld）

`app/components/three-world/index.tsx` 将场景拆成多个子系统（组合式装配）：
- Renderer：渲染循环/帧同步、WebGPU 开关、PBR 开关、像素比控制
- Lights：灯光系统
- Models：模型系统（可多模型）
- RunModes：运行模式（Player/Game/Intro）
- Camera：相机系统 + CameraWork（多相机模式）
- Controls：Orbit/Transform 控制等
- Effects：后期（WebGL Pass 或 WebGPU Node 链）
- Skybox：HDR 环境
- Plugins / Debug / Credits：辅助系统

## 3. 状态与数据模型（Zustand 三层）

> 该项目的“配置/资源/运行时”拆成 3 个 store：ConfigStore、PresetStore、GlobalStore。

### 3.1 ConfigStore：资源库 + 用户身份（持久化）

位置：`app/stores/useConfigStore.ts`

职责：
- 存储“资源文件”本体（base64/dataURL）：模型 pmx/pmd、动作 vmd、相机、音乐等
- 维护资源哈希、preset 列表信息
- 生成并持久化 `uid`（多人协作用），并在首次水合后注册用户

存储介质：
- localforage（实例名 `mmd-storage`）+ 自定义 persist 中间件

### 3.2 PresetStore：场景配置/调参快照（持久化）

位置：`app/stores/usePresetStore.ts`，默认模板：`app/presets/Default_config.json`

职责：
- 保存“播放/渲染/相机/灯光/后期/运行模式/模型挂载”等参数（类似工程文件）
- 多 preset 切换：通过切换 localforage instance 实现

### 3.3 GlobalStore：运行时对象引用（不持久化）

位置：`app/stores/useGlobalStore.ts`

职责（典型字段）：
- three/MMD 运行时对象：`loader`、`camera`、`runtimeCharacter(mixer/physics/ik/grant)`、`models`（已加载 skinnedMesh）
- 播放器：`player`（HTMLAudioElement/VideoElement，作为时间源）
- GUI/选择状态：`gui`、`selectedName`、`enabledTransform`、`openMainUI`
- 多人：`peerChannels`、`groupChannels`、`onOfferingRef/onAnsweringRef/onInitRef`、`remoteModels` 等

### 3.4 WithReady：渲染门禁

位置：`app/stores/WithReady.tsx`

含义：
- 在 `storeReady && player` 之前，不渲染依赖“时间源/配置”的子系统（避免水合前后抖动与空引用）。

## 4. 资源管理模块（本地资源/远端资源）

### 4.1 选择文件入口（隐藏 input）

- `app/components/file-selector/index.tsx`：页面里常驻一个 `<input id="selectFile" />`
- 各资源类型的 `onCreate()` 会配置该 input（例如目录选择、文件类型），并读取文件内容写入 ConfigStore

### 4.2 MainUI（MUI 抽屉）资源面板

位置：`app/components/main-ui/*`

结构：
- `main-ui/index.tsx`：左上角按钮打开 Modal
- `main-ui/Panel.tsx`：左侧 Drawer（Presets/Models/Motions/Cameras/Musics）
- `main-ui/context.ts`：resourcesMap（资源类型路由）
- 每种资源目录下基本都有：`onCreate/onLoad/onRead/onDelete/useNames` 等

典型例子：
- Models：`main-ui/models/onCreate.ts` 支持选择“解压后的模型文件夹”，将 pmx/pmd + 贴图写入 ConfigStore，并更新 PresetStore.models
- Motions/Cameras/Musics：通过 `loadFile` 读取单文件并保存到 ConfigStore，再由 PresetStore 引用名称

### 4.3 Remote/Peers Resources（多人资源交换）

位置：`app/components/main-ui/resources/*` + `app/components/multiplayer/fileTransfer/*`

职责：
- 在多人模式中，通过 DataChannel 共享资源（文件列表/哈希/拉取文件）
- RemoteResources/PeersResources 负责展示与拉取流程

## 5. MMD 资产加载与运行时（核心）

### 5.1 MMDLoader（重构版）

位置：`app/modules/MMDLoader.ts`

职责：
- 解析 PMX/PMD（模型）与 VMD/VPD（动作/姿态），组装成 three.js 的 `SkinnedMesh` 与 `AnimationClip`
- 处理纹理映射（支持从“用户导入的贴图字典”重定向路径）
- 支持 SDEF、PBR、WebGPU 路径（部分 shader/材质在 `app/modules/shaders/*`、`app/modules/effects/webgpu/*`）

### 5.2 PMXModel（r3f 组件封装）

位置：`app/components/three-world/model/PMXModel.tsx`

流程：
- 从 GlobalStore 拿 `loader`，调用 `loader.loadAsync(url)` 获取 { geometry/material/data }
- `initBones()` 将骨骼装配进 skinnedMesh，并写入 `boneBasePos` 作为基准
- onCreate/onDispose 将 mesh 注入/移出 GlobalStore.models

### 5.3 Model（场景中“一个模型实例”）

位置：`app/components/three-world/model/Model.tsx`

职责：
- 将 PresetStore.models 的配置（文件名/动作列表/开关）映射为 PMXModel + 一组 helper 子模块：
  - Morph（表情/形变）
  - Material（材质调参）
  - Physics（MMDPhysics）
  - Animation（动作混合、播放器时间驱动）
- 支持多模型与“目标模型”概念（targetModelId）

## 6. 播放与时间源（AudioPlayer 驱动全局时间）

位置：`app/components/control-bar/audio-player/index.tsx`

核心点：
- 通过 media-chrome 渲染音频控制条
- audio element 被写入 GlobalStore.player，作为全局时间源
- `useRenderLoop()` 在 r3f 的 `useFrame` 中用 `player.currentTime` 计算 `playDeltaRef`（用于驱动 camera/motion 更新、seek 保存等）

相关文件：
- 渲染循环：`app/components/three-world/renderer/useRenderLoop.ts`
- 顶部控制条自动隐藏：`app/components/control-bar/*`

## 7. 相机系统（多模式）

入口：`app/components/three-world/camera/*`

组成：
- `camera/index.tsx`：PerspectiveCamera + CameraWorkHelper
- `camera/helper/index.tsx`：Camera Mode 路由
  - Motion File：跟随相机动作文件
  - Fix Following：固定跟随
  - Director：快捷键导演模式
  - Editor：Theatre.js 时间轴编辑
  - AR：手机 AR 辅助（与 /ar-camera 页面联动）

AR 辅助页面：
- `app/ar-camera/*`：XR HitTest 放置物体，并用 WebRTC DataChannel 发送矩阵数据

## 8. 后期/特效系统（WebGL vs WebGPU 双链路）

入口：`app/components/effects/index.tsx`

- WebGL（默认）：EffectComposer + Pass（Outline / NormalBlending / DepthOfField(HexDoF) / Bloom / DebugTexture）
- WebGPU（实验）：WebGPUEffectComposer + Node（OutlineNode / DofNode / BloomNode / PassNode）

自研 shader / pass：
- `app/modules/effects/*`
- `app/modules/effects/shaders/*`（大量 GLSL）
- `app/modules/shaders/*`（MMD Toon/SDEF 等）

## 9. 运行模式（RunModes）

位置：`app/components/three-world/run-modes/*`

- Player Mode：播放器导向（时间轴/镜头/后期）
- Game Mode：多玩家角色控制与交互（WASD/跳跃/菜单）
- Introduction Mode：演示/引导式播放

## 10. 多人协作（Firestore 信令 + WebRTC 多通道）

### 10.1 信令（Firestore）

位置：`app/modules/firebase/init.ts`

用途：
- users：在线/活跃用户列表
- connections：SDP Offer/Answer 交换（`setSDP`、`listenOnConnections`）

注意：
- 若缺少 Firebase 配置，模块会降级为空实现（多人功能不可用，但不阻塞应用运行）。

### 10.2 WebRTC 连接管理

位置：`app/components/multiplayer/peer/*`

- `createPeer.tsx`：创建 RTCPeerConnection，固定 negotiated datachannel:
  - `signal` 通道（id=0）：用于发“initCode/配对码”等轻量信息
- `useOfferRTC.tsx`：发起方创建 offer，写入 Firestore，并等待 answer 回写
- `useAnswerRTC.tsx`：应答方监听 offer，setRemoteDescription 后 setLocalDescription 回写 answer
- `useSdpListener.ts`：统一订阅 Firestore connections，把消息分发给 offer/answer 回调

### 10.3 多路业务通道（GroupChannel + useChannel）

位置：`app/components/multiplayer/peer/channel/*`

- `useChannel`：创建 negotiated DataChannel（按 label+id），并包装 send/message 为 JSON
- `GroupChannel`：把某 label 的通道组织成“广播组”，统一 send/onMessage

典型业务：
- chat：群聊
- fileTransfer：资源共享/拉取

## 11. 目录结构速查（按职责）

```
web-mmd/
  app/
    components/
      three-world/         # three 场景子系统（模型/相机/控制/后期/运行模式…）
      control-bar/         # 播放控制条（音频时间源）+ 全屏按钮
      panel/               # Leva GUI 容器
      main-ui/             # MUI 资源管理面板（本地/远端）
      multiplayer/         # 多人：房间/连接/通道/文件传输/聊天
      qrcode-overlay/      # 二维码/配对辅助
      loading-overlay/     # 加载提示
      file-selector/       # 隐藏文件 input（资源导入入口）
    modules/
      MMDLoader.ts         # MMD 核心加载器（PMX/VMD/材质/shader）
      firebase/            # Firestore 信令与用户活跃管理
      effects/             # 后期 pass、shader、webgpu 实现
      shaders/             # MMD toon / SDEF 等 shader
    presets/               # 默认 preset / theatre state / 空工程
    stores/                # Zustand：Config/Preset/Global + WithReady
    middleware/            # persist 中间件
    utils/                 # GUI 构建、读文件等工具
  public/                  # 静态资源（HDR、gltf、默认 preset data）
  tests/                   # Playwright E2E
  next.config.ts           # 静态导出配置 + 环境变量注入
```

## 12. 典型数据流（从导入到播放）

1) 导入资源：
- MainUI → 对应资源 `onCreate/onLoad` → 写入 ConfigStore（base64）

2) 组装场景：
- PresetStore.models 引用 ConfigStore 的文件名
- `<ThreeWorld>` → `<Models>` → `<Model>` → `<PMXModel>` 调用 GlobalStore.loader 加载

3) 播放驱动：
- AudioPlayer 把 audio element 写入 GlobalStore.player
- RenderLoop 每帧读取 `player.currentTime` 计算 `playDeltaRef`
- Animation/Camera/Effects 根据 `playDeltaRef` 或 preset 参数更新 three world

4) 多人模式：
- ConfigStore.uid（本地生成）→ Firestore users 标记活跃
- Room 获取活跃用户列表并连接（WebRTC）
- DataChannel 发送/接收 chat、资源同步、远端模型状态等






# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
1、模型我想默认读取 public\MMD\芙宁娜，改下代码实现




# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
Uncaught TypeError: Cannot read properties of undefined (reading 'startsWith')
    at PMXModel.useEffect (F:\Projects\AI-Human\web-mmd\app\components\three-world\model\PMXModel.tsx:31:17)
    at react-stack-bottom-frame (react-reconciler.development.js:7241:22)
    at runWithFiberInDEV (react-reconciler.development.js:399:20)
    at commitHookEffectListMount (react-reconciler.development.js:4782:628)
    at commitHookPassiveMountEffects (react-reconciler.development.js:4817:60)
    at reconnectPassiveEffects (react-reconciler.development.js:5670:17)
    at recursivelyTraverseReconnectPassiveEffects (react-reconciler.development.js:5661:68)
    at reconnectPassiveEffects (react-reconciler.development.js:5669:17)
    at recursivelyTraverseReconnectPassiveEffects (react-reconciler.development.js:5661:68)
    at reconnectPassiveEffects (react-reconciler.development.js:5669:17)
    at recursivelyTraverseReconnectPassiveEffects (react-reconciler.development.js:5661:68)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5648:451)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5648:306)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
PMXModel.useEffect @ F:\Projects\AI-Human\web-mmd\app\components\three-world\model\PMXModel.tsx:31
react-stack-bottom-frame @ react-reconciler.development.js:7241
runWithFiberInDEV @ react-reconciler.development.js:399
commitHookEffectListMount @ react-reconciler.development.js:4782
commitHookPassiveMountEffects @ react-reconciler.development.js:4817
reconnectPassiveEffects @ react-reconciler.development.js:5670
recursivelyTraverseReconnectPassiveEffects @ react-reconciler.development.js:5661
reconnectPassiveEffects @ react-reconciler.development.js:5669
recursivelyTraverseReconnectPassiveEffects @ react-reconciler.development.js:5661
reconnectPassiveEffects @ react-reconciler.development.js:5669
recursivelyTraverseReconnectPassiveEffects @ react-reconciler.development.js:5661
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5627
flushPassiveEffects @ react-reconciler.development.js:6567
eval @ react-reconciler.development.js:6507
performWorkUntilDeadline @ scheduler.development.js:44
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1010 [RC式空域014-数据空间] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\page.tsx:33 TypeError: Cannot read properties of undefined (reading 'startsWith')
    at PMXModel.useEffect (F:\Projects\AI-Human\web-mmd\app\components\three-world\model\PMXModel.tsx:31:17)
    at react-stack-bottom-frame (react-reconciler.development.js:7241:22)
    at runWithFiberInDEV (react-reconciler.development.js:399:20)
    at commitHookEffectListMount (react-reconciler.development.js:4782:628)
    at commitHookPassiveMountEffects (react-reconciler.development.js:4817:60)
    at reconnectPassiveEffects (react-reconciler.development.js:5670:17)
    at recursivelyTraverseReconnectPassiveEffects (react-reconciler.development.js:5661:68)
    at reconnectPassiveEffects (react-reconciler.development.js:5669:17)
    at recursivelyTraverseReconnectPassiveEffects (react-reconciler.development.js:5661:68)
    at reconnectPassiveEffects (react-reconciler.development.js:5669:17)
    at recursivelyTraverseReconnectPassiveEffects (react-reconciler.development.js:5661:68)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5648:451)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5622:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5648:306)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)
    at recursivelyTraversePassiveMountEffects (react-reconciler.development.js:5614:106)
    at commitPassiveMountOnFiber (react-reconciler.development.js:5656:17)

The above error occurred in the <CanvasImpl> component. It was handled by the <ErrorBoundaryHandler> error boundary.
onCaughtError @ error-boundary-callbacks.js:68
logCaughtError @ react-dom-client.development.js:8528
runWithFiberInDEV @ react-dom-client.development.js:872
update.callback @ react-dom-client.development.js:8561
callCallback @ react-dom-client.development.js:6554
commitCallbacks @ react-dom-client.development.js:6574
runWithFiberInDEV @ react-dom-client.development.js:872
commitClassCallbacks @ react-dom-client.development.js:12507
commitLayoutEffectOnFiber @ react-dom-client.development.js:13125
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13053
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13164
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13164
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13053
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13053
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13053
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13053
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13048
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13255
recursivelyTraverseLayoutEffects @ react-dom-client.development.js:14121
commitLayoutEffectOnFiber @ react-dom-client.development.js:13130
flushLayoutEffects @ react-dom-client.development.js:16156
commitRoot @ react-dom-client.development.js:15997
commitRootWhenReady @ react-dom-client.development.js:15228
performWorkOnRoot @ react-dom-client.development.js:15147
performWorkOnRootViaSchedulerTask @ react-dom-client.development.js:16816
performWorkUntilDeadline @ scheduler.development.js:45
<CanvasImpl>
exports.jsx @ react-jsx-runtime.development.js:323
Canvas @ react-three-fiber.esm.js:204
react_stack_bottom_frame @ react-dom-client.development.js:23584
renderWithHooks @ react-dom-client.development.js:6793
updateFunctionComponent @ react-dom-client.development.js:9247
beginWork @ react-dom-client.development.js:10858
runWithFiberInDEV @ react-dom-client.development.js:872
performUnitOfWork @ react-dom-client.development.js:15727
workLoopConcurrentByScheduler @ react-dom-client.development.js:15721
renderRootConcurrent @ react-dom-client.development.js:15696
performWorkOnRoot @ react-dom-client.development.js:14990
performWorkOnRootViaSchedulerTask @ react-dom-client.development.js:16816
performWorkUntilDeadline @ scheduler.development.js:45
<Canvas>
exports.jsxDEV @ react-jsx-dev-runtime.development.js:323
Home @ F:\Projects\AI-Human\web-mmd\app\page.tsx:33
react_stack_bottom_frame @ react-dom-client.development.js:23584
renderWithHooks @ react-dom-client.development.js:6793
updateFunctionComponent @ react-dom-client.development.js:9247
beginWork @ react-dom-client.development.js:10858
runWithFiberInDEV @ react-dom-client.development.js:872
performUnitOfWork @ react-dom-client.development.js:15727
workLoopConcurrentByScheduler @ react-dom-client.development.js:15721
renderRootConcurrent @ react-dom-client.development.js:15696
performWorkOnRoot @ react-dom-client.development.js:14990
performWorkOnRootViaSchedulerTask @ react-dom-client.development.js:16816
performWorkUntilDeadline @ scheduler.development.js:45
<Home>
exports.jsx @ react-jsx-runtime.development.js:323
ClientPageRoot @ client-page.js:20
react_stack_bottom_frame @ react-dom-client.development.js:23584
renderWithHooks @ react-dom-client.development.js:6793
updateFunctionComponent @ react-dom-client.development.js:9247
beginWork @ react-dom-client.development.js:10807
runWithFiberInDEV @ react-dom-client.development.js:872
performUnitOfWork @ react-dom-client.development.js:15727
workLoopConcurrentByScheduler @ react-dom-client.development.js:15721
renderRootConcurrent @ react-dom-client.development.js:15696
performWorkOnRoot @ react-dom-client.development.js:14990
performWorkOnRootViaSchedulerTask @ react-dom-client.development.js:16816
performWorkUntilDeadline @ scheduler.development.js:45
"use client"
Function.all @ VM6461 <anonymous>:1
initializeElement @ react-server-dom-webpack-client.browser.development.js:1376
"use server"
ResponseInstance @ react-server-dom-webpack-client.browser.development.js:2091
createResponseFromOptions @ react-server-dom-webpack-client.browser.development.js:3155
exports.createFromReadableStream @ react-server-dom-webpack-client.browser.development.js:3540
eval @ app-index.js:130
(app-pages-browser)/./node_modules/next/dist/client/app-index.js @ main-app.js?v=1773652981543:160
options.factory @ webpack.js:1
__webpack_require__ @ webpack.js:1
fn @ webpack.js:1
eval @ app-next-dev.js:14
eval @ app-bootstrap.js:59
loadScriptsInSequence @ app-bootstrap.js:24
appBootstrap @ app-bootstrap.js:53
eval @ app-next-dev.js:13
(app-pages-browser)/./node_modules/next/dist/client/app-next-dev.js @ main-app.js?v=1773652981543:182
options.factory @ webpack.js:1
__webpack_require__ @ webpack.js:1
__webpack_exec__ @ main-app.js?v=1773652981543:1878
（匿名） @ main-app.js?v=1773652981543:1879
webpackJsonpCallback @ webpack.js:1
（匿名） @ main-app.js?v=1773652981543:9
three.core.js:1926 THREE.WebGLRenderer: Context Lost.




# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
1、出现了新的BUG，看不到人
2、Runtime TypeError


The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type undefined

app\modules\MMDLoader.ts (229:25) @ MMDLoader.loadPMX


  227 | 		const parser = this._getParser();
  228 |
> 229 | 		const buffer = Buffer.from(url.split("base64,")[1], 'base64').buffer;
      | 		                      ^
  230 | 		const model = parser.parsePmx(buffer, true)
  231 |
  232 | 		return model

3、index.js:123 Uncaught (in promise) TypeError: The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type undefined




# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
1、现在能到看到人了，但是没有动作，之前点击播放按钮，是能够播放动作的
2、现在点击播放按钮（只有背景音和镜头视角切换），人物没有任何反应
3、修复这个bUG
4、以前人物是可以唱歌跳舞的，现在人物却只能待机了，检查下问题




# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
1、顶部做一个中英切换按钮，将所有模块能够切换中英文





# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
1、单独开发一个页面 https://localhost:3001/aihuman
2、在这个页面上能够看到人物模型，人物呈待机状态
3、这个页面上同样有舞台，人物站在舞台上
4、在这个页面上点击讲话按钮，人物对口型朗读





# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
Runtime Error


R3F: Button is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively

app\aihuman\page.tsx (17:7) @ Page


  15 |   return (
  16 |     <>
> 17 |       <Canvas
     |       ^
  18 |         shadows
  19 |         camera={{ position: [0, 12, 55], fov: 45, near: 0.1, far: 2000 }}
  20 |       >





# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
1、人物站姿有问题，人物应该是站在舞台上，而不是穿模站在舞台底下
2、人物姿势全身是摊开的（没有读取动作文件），需要修正为正常待机姿势
3、整个灯光有问题
4、可以多参考下主页的做法，对/aihuman进行修复


# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
1、人物所处的位置不对，人物应该站在舞台中央，而不是站在舞台底下，多参考下主页的做法，修正为正常位置
2、摄像机初始视角不对，需要正对任务，多参考下主页的做法，修正为正常视角
3、光线不对，需要多参考下主页的做法，修正为正常光线



# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
[Funingna] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [RC式空域014-数据空间] sdef: true, PBR: true
2three.core.js:1968 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
F:\Projects\AI-Human\web-mmd\app\stores\useConfigStore.ts:81 migrate ConfigStore
2F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
three.core.js:1968 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
three.core.js:1968 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
three.core.js:1968 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
three.core.js:1968 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
three.core.js:1968 THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.
warn @ three.core.js:1968
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
bind @ three.core.js:36855
_getValue_unbound @ three.core.js:36831
saveOriginalState @ three.core.js:36426
_activateAction @ three.core.js:37914
play @ three.core.js:37285
AihumanScene.useEffect.init @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146
await in AihumanScene.useEffect.init
AihumanScene.useEffect @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:150
react-stack-bottom-frame @ react-reconciler.development.js:7241
runWithFiberInDEV @ react-reconciler.development.js:399
commitHookEffectListMount @ react-reconciler.development.js:4782
commitHookPassiveMountEffects @ react-reconciler.development.js:4817
commitPassiveMountOnFiber @ react-reconciler.development.js:5623
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5627
flushPassiveEffects @ react-reconciler.development.js:6567
commitRootImpl @ react-reconciler.development.js:6522
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performSyncWorkOnRoot @ react-reconciler.development.js:1364
flushSyncWorkAcrossRoots_impl @ react-reconciler.development.js:1288
commitRootImpl @ react-reconciler.development.js:6525
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performWorkOnRootViaSchedulerTask @ react-reconciler.development.js:1356
performWorkUntilDeadline @ scheduler.development.js:44
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
bind @ three.core.js:36855
_getValue_unbound @ three.core.js:36831
saveOriginalState @ three.core.js:36426
_activateAction @ three.core.js:37914
play @ three.core.js:37285
AihumanScene.useEffect.init @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146
await in AihumanScene.useEffect.init
AihumanScene.useEffect @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:150
react-stack-bottom-frame @ react-reconciler.development.js:7241
runWithFiberInDEV @ react-reconciler.development.js:399
commitHookEffectListMount @ react-reconciler.development.js:4782
commitHookPassiveMountEffects @ react-reconciler.development.js:4817
commitPassiveMountOnFiber @ react-reconciler.development.js:5623
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5627
flushPassiveEffects @ react-reconciler.development.js:6567
commitRootImpl @ react-reconciler.development.js:6522
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performSyncWorkOnRoot @ react-reconciler.development.js:1364
flushSyncWorkAcrossRoots_impl @ react-reconciler.development.js:1288
commitRootImpl @ react-reconciler.development.js:6525
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performWorkOnRootViaSchedulerTask @ react-reconciler.development.js:1356
performWorkUntilDeadline @ scheduler.development.js:44
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
bind @ three.core.js:36855
_getValue_unbound @ three.core.js:36831
saveOriginalState @ three.core.js:36426
_activateAction @ three.core.js:37914
play @ three.core.js:37285
AihumanScene.useEffect.init @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146
await in AihumanScene.useEffect.init
AihumanScene.useEffect @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:150
react-stack-bottom-frame @ react-reconciler.development.js:7241
runWithFiberInDEV @ react-reconciler.development.js:399
commitHookEffectListMount @ react-reconciler.development.js:4782
commitHookPassiveMountEffects @ react-reconciler.development.js:4817
commitPassiveMountOnFiber @ react-reconciler.development.js:5623
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5627
flushPassiveEffects @ react-reconciler.development.js:6567
commitRootImpl @ react-reconciler.development.js:6522
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performSyncWorkOnRoot @ react-reconciler.development.js:1364
flushSyncWorkAcrossRoots_impl @ react-reconciler.development.js:1288
commitRootImpl @ react-reconciler.development.js:6525
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performWorkOnRootViaSchedulerTask @ react-reconciler.development.js:1356
performWorkUntilDeadline @ scheduler.development.js:44
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
bind @ three.core.js:36855
_getValue_unbound @ three.core.js:36831
saveOriginalState @ three.core.js:36426
_activateAction @ three.core.js:37914
play @ three.core.js:37285
AihumanScene.useEffect.init @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146
await in AihumanScene.useEffect.init
AihumanScene.useEffect @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:150
react-stack-bottom-frame @ react-reconciler.development.js:7241
runWithFiberInDEV @ react-reconciler.development.js:399
commitHookEffectListMount @ react-reconciler.development.js:4782
commitHookPassiveMountEffects @ react-reconciler.development.js:4817
commitPassiveMountOnFiber @ react-reconciler.development.js:5623
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5627
flushPassiveEffects @ react-reconciler.development.js:6567
commitRootImpl @ react-reconciler.development.js:6522
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performSyncWorkOnRoot @ react-reconciler.development.js:1364
flushSyncWorkAcrossRoots_impl @ react-reconciler.development.js:1288
commitRootImpl @ react-reconciler.development.js:6525
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performWorkOnRootViaSchedulerTask @ react-reconciler.development.js:1356
performWorkUntilDeadline @ scheduler.development.js:44
F:\Projects\AI-Human\web-mmd\app\modules\MMDLoader.ts:1037 [Funingna] sdef: true, PBR: true
F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146 THREE.PropertyBinding: No target node found for track: smoothCenter.position.
warn @ three.core.js:1968
bind @ three.core.js:36855
_getValue_unbound @ three.core.js:36831
saveOriginalState @ three.core.js:36426
_activateAction @ three.core.js:37914
play @ three.core.js:37285
AihumanScene.useEffect.init @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:146
await in AihumanScene.useEffect.init
AihumanScene.useEffect @ F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:150
react-stack-bottom-frame @ react-reconciler.development.js:7241
runWithFiberInDEV @ react-reconciler.development.js:399
commitHookEffectListMount @ react-reconciler.development.js:4782
commitHookPassiveMountEffects @ react-reconciler.development.js:4817
commitPassiveMountOnFiber @ react-reconciler.development.js:5623
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5648
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5656
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5622
recursivelyTraversePassiveMountEffects @ react-reconciler.development.js:5614
commitPassiveMountOnFiber @ react-reconciler.development.js:5627
flushPassiveEffects @ react-reconciler.development.js:6567
commitRootImpl @ react-reconciler.development.js:6522
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performSyncWorkOnRoot @ react-reconciler.development.js:1364
flushSyncWorkAcrossRoots_impl @ react-reconciler.development.js:1288
commitRootImpl @ react-reconciler.development.js:6525
commitRoot @ react-reconciler.development.js:6480
commitRootWhenReady @ react-reconciler.development.js:6082
performWorkOnRoot @ react-reconciler.development.js:6062
performWorkOnRootViaSchedulerTask @ react-reconciler.development.js:1356
performWorkUntilDeadline @ scheduler.development.js:44




# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
1、这个页面问题很多，建议人物部分完全按照首页的方法来初始化
2、初始化选择一个待机动作.vmd
3、播放按钮放在右上角，点击后朗读
4、如果还是不行就将主页人物相关的代码复刻到这里，注意不要复刻那些功能，保障这个页面数字人相关的核心代码
5、播放按钮，加载完模型后就看不到了，修复下这个问题


# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
1、加载模型的代码，有问题，一直在重复加载。参考下首页的做法，loading 完成后，就不重复加载了
2、Runtime AbortError The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22
3、F:\Projects\AI-Human\web-mmd\app\aihuman\AihumanScene.tsx:134 THREE.PropertyBinding: No target node found for track:  THREE.PropertyBinding: No target node found for track: smoothCenter.position.
4、Uncaught (in promise) AbortError: The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22




# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### / 首页 BUG修复
Runtime TypeError


Cannot read properties of undefined (reading 'getWorldPosition')

app\components\three-world\camera\helper\fix-following-mode\index.tsx (18:67) @ getCenterPos


  16 |     const cameraOffset = useGlobalStore(state => state.cameraOffset)
  17 |
> 18 |     const getCenterPos = () => targetModel.skeleton.getBoneByName("上半身").getWorldPosition(cameraOffset.center)
     |                                                                   ^
  19 |
  20 |     const tempWeight = useRef(new Vector3()).current
  21 |



# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
1、修复下半身问题，下半身腿是僵直的，没有自然站立
2、修复舞台问题，RedialC_EpRoomDS/EPDS.pmx 没有显示出来，另外人物需要站在 RedialC_EpRoomDS/EPDS.pmx 上面，具体位置参数可以参考首页
3、修复光源 渲染问题，人物需要有光源，具体位置参数可以参考首页


# 接下来的任务（前端）
在 web-mmd/app 继续迭代功能

## 要求
1、要符合这个工程文件的目录结构和代码规范
2、要在这个工程文件的基础上继续迭代，不能完全重新开始

## 开发功能
### /aihuman BUG修复
1、人物是悬空的，没有踩在舞台上，需要让人物的脚踩在舞台上，可以参考下