"use client"

import { Button } from "@mui/material"
import { useT } from "@/app/i18n/useT"
import useAihumanControlStore from "./useAihumanControlStore"

const buttonStyle = {
  position: "fixed",
  top: "25px",
  right: "25px",
  zIndex: 3000,
} as const

export default function AihumanControls() {
  const t = useT()
  const speaking = useAihumanControlStore((s) => s.speaking)
  const speak = useAihumanControlStore((s) => s.speak)
  const stop = useAihumanControlStore((s) => s.stop)

  return (
    <Button
      variant="contained"
      sx={buttonStyle}
      size="large"
      disabled={!speak || !stop}
      onClick={() => {
        if (!speak || !stop) return
        if (speaking) stop()
        else speak()
      }}
    >
      {speaking ? t("aihuman.stop") : t("aihuman.speak")}
    </Button>
  )
}

