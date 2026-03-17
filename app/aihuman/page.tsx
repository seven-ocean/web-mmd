"use client"

import { Canvas } from "@react-three/fiber"
import LangToggle from "@/app/components/lang-toggle"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import AihumanScene from "./AihumanScene"
import { PCFShadowMap } from "three"
import AihumanControls from "./AihumanControls"

const theme = createTheme({
  colorSchemes: {
    dark: true,
  },
})

export default function Page() {
  return (
    <>
      <Canvas
        shadows={{ type: PCFShadowMap }}
        camera={{ position: [0, 12, 55], fov: 45, near: 0.1, far: 2000 }}
      >
        <color attach="background" args={["#0b0f14"]} />
        <AihumanScene />
      </Canvas>
      <ThemeProvider theme={theme}>
        <LangToggle side="left" />
        <AihumanControls />
      </ThemeProvider>
    </>
  )
}
