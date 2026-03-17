import useConfigStore from "@/app/stores/useConfigStore"
import { I18nKey, Lang, messages } from "./messages"

export function useLang(): Lang {
  return (useConfigStore((s: any) => s.lang) as Lang) ?? "zh"
}

export function useT() {
  const lang = useLang()
  return (key: I18nKey) => messages[lang]?.[key] ?? key
}

