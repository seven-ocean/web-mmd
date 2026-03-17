export type Lang = "zh" | "en"

export type I18nKey =
  | "lang.zh"
  | "lang.en"
  | "ui.mainMenu"
  | "ui.settings"
  | "resource.Presets"
  | "resource.Models"
  | "resource.Motions"
  | "resource.Cameras"
  | "resource.Musics"
  | "resource.copyPreset"
  | "resource.savePreset"
  | "resource.saveConfigOnly"
  | "resource.deletePreset"
  | "resource.deleteModel"
  | "resource.deleteMotion"
  | "resource.enterModelName"
  | "intro.tagline"
  | "intro.whatIsMmd"
  | "intro.whatIsMmdDesc"
  | "intro.music"
  | "intro.musicDesc"
  | "intro.models"
  | "intro.modelsDesc1"
  | "intro.modelsDesc2"
  | "intro.motions"
  | "intro.motionsDesc1"
  | "intro.motionsDesc2"
  | "aihuman.speak"
  | "aihuman.stop"

export const messages: Record<Lang, Record<I18nKey, string>> = {
  zh: {
    "lang.zh": "中文",
    "lang.en": "English",
    "ui.mainMenu": "主菜单",
    "ui.settings": "设置",
    "resource.Presets": "预设",
    "resource.Models": "模型",
    "resource.Motions": "动作",
    "resource.Cameras": "镜头",
    "resource.Musics": "音乐",
    "resource.copyPreset": "复制预设",
    "resource.savePreset": "保存预设",
    "resource.saveConfigOnly": "仅保存配置",
    "resource.deletePreset": "删除预设",
    "resource.deleteModel": "删除模型",
    "resource.deleteMotion": "删除动作",
    "resource.enterModelName": "输入模型名称",
    "intro.tagline": "跨平台 MMD 播放器",
    "intro.whatIsMmd": "什么是 MMD？",
    "intro.whatIsMmdDesc": "MikuMikuDance（MMD）是用于制作高质量舞蹈 MV 的免费 3D 软件。",
    "intro.music": "音乐",
    "intro.musicDesc": "你可以加载音频文件！",
    "intro.models": "模型",
    "intro.modelsDesc1": "你可以从 MMD 资源站下载角色/舞台模型。",
    "intro.modelsDesc2": "例如 bowlroll.net 或 3d.nicovideo.jp！",
    "intro.motions": "动作",
    "intro.motionsDesc1": "你可以从 MMD 资源站下载舞蹈/表情/镜头动作。",
    "intro.motionsDesc2": "例如 bowlroll.net 或 3d.nicovideo.jp！",
    "aihuman.speak": "播放",
    "aihuman.stop": "停止",
  },
  en: {
    "lang.zh": "中文",
    "lang.en": "English",
    "ui.mainMenu": "Main menu",
    "ui.settings": "Settings",
    "resource.Presets": "Presets",
    "resource.Models": "Models",
    "resource.Motions": "Motions",
    "resource.Cameras": "Cameras",
    "resource.Musics": "Musics",
    "resource.copyPreset": "Copy Preset",
    "resource.savePreset": "Save Preset",
    "resource.saveConfigOnly": "Save Config Only",
    "resource.deletePreset": "Delete Preset",
    "resource.deleteModel": "Delete Model",
    "resource.deleteMotion": "Delete Motion",
    "resource.enterModelName": "Enter model name",
    "intro.tagline": "A Cross-Platform MMD Player",
    "intro.whatIsMmd": "What is MMD?",
    "intro.whatIsMmdDesc": "MikuMikuDance (MMD) is a free 3D software for making high-quality dancing MV.",
    "intro.music": "Music",
    "intro.musicDesc": "You can load an audio file!",
    "intro.models": "Models",
    "intro.modelsDesc1": "You can download character and stage models from MMD resource sites.",
    "intro.modelsDesc2": "Like bowlroll.net or 3d.nicovideo.jp!",
    "intro.motions": "Motions",
    "intro.motionsDesc1": "You can download dancing, emotion, and camera motions from MMD resource sites.",
    "intro.motionsDesc2": "Like bowlroll.net or 3d.nicovideo.jp!",
    "aihuman.speak": "Play",
    "aihuman.stop": "Stop",
  },
}
