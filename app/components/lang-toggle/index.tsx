import useConfigStore from "@/app/stores/useConfigStore"
import { useT } from "@/app/i18n/useT"
import { Button } from "@mui/material"

type Props = {
  side?: "left" | "right"
  top?: number
  offset?: number
}

function LangToggle({ side = "right", top = 25, offset = 25 }: Props) {
  const t = useT()
  const lang = useConfigStore((s: any) => s.lang) ?? "zh"
  const onClick = () => {
    useConfigStore.setState({ lang: lang === "zh" ? "en" : "zh" })
  }

  return (
    <Button
      variant="contained"
      sx={{
        position: "fixed",
        top: `${top}px`,
        [side]: `${offset}px`,
        zIndex: 2000,
      }}
      size="large"
      onClick={onClick}
    >
      {lang === "zh" ? t("lang.en") : t("lang.zh")}
    </Button>
  )
}

export default LangToggle
