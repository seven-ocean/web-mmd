import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bone, SkinnedMesh } from "three"

type LipSyncController = {
  speaking: boolean
  speak: () => Promise<void>
  stop: () => void
}

function pickMouthMorph(mesh: SkinnedMesh) {
  const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined
  if (!dict) return null

  const candidates = [
    "口開",
    "口開け",
    "口開き",
    "口_開",
    "口",
    "嘴",
    "mouthOpen",
    "mouth_open",
    "MouthOpen",
    "A",
    "aa",
    "あ",
  ]

  for (const key of candidates) {
    if (key in dict) return key
  }

  for (const key of Object.keys(dict)) {
    if (key.includes("口") || key.toLowerCase().includes("mouth")) return key
  }

  return null
}

function pickJawBone(mesh: SkinnedMesh) {
  const skeleton = mesh.skeleton
  if (!skeleton) return null
  const candidates = ["下顎", "下あご", "下あご先", "jaw", "Jaw"]
  for (const name of candidates) {
    const bone = skeleton.getBoneByName(name)
    if (bone) return bone as Bone
  }
  return null
}

export default function useLipSync(target: SkinnedMesh | null, audioUrl: string): LipSyncController {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const [speaking, setSpeaking] = useState(false)

  const mouthMorphName = useMemo(() => (target ? pickMouthMorph(target) : null), [target])
  const jawBone = useMemo(() => (target ? pickJawBone(target) : null), [target])
  const jawBaseRotX = useRef<number>(0)

  useEffect(() => {
    if (!jawBone) return
    jawBaseRotX.current = jawBone.rotation.x
  }, [jawBone])

  const stop = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect()
      } catch {}
      sourceRef.current = null
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect()
      } catch {}
      analyserRef.current = null
    }
    setSpeaking(false)
    const mesh = target
    if (mesh && mouthMorphName) {
      const influences = (mesh as any).morphTargetInfluences as number[] | undefined
      const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined
      const idx = dict?.[mouthMorphName]
      if (influences && typeof idx === "number") influences[idx] = 0
    }
    if (jawBone) {
      jawBone.rotation.x = jawBaseRotX.current
    }
  }, [jawBone, mouthMorphName, target])

  const speak = useCallback(async () => {
    if (!target) return
    stop()

    const audio = new Audio(audioUrl)
    audio.crossOrigin = "anonymous"
    audioRef.current = audio

    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) {
      try {
        await audio.play()
        setSpeaking(true)
      } catch (e: any) {
        if (e?.name !== "AbortError") throw e
      }
      return
    }

    const ctx = audioCtxRef.current ?? new AudioContextCtor()
    audioCtxRef.current = ctx
    if (ctx.state === "suspended") {
      await ctx.resume()
    }

    const source = ctx.createMediaElementSource(audio)
    sourceRef.current = source

    const analyser = ctx.createAnalyser()
    analyserRef.current = analyser
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.85

    source.connect(analyser)
    analyser.connect(ctx.destination)

    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      const mesh = target
      if (!mesh) return
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const avg = sum / (data.length * 255)
      const amp = Math.min(1, Math.max(0, (avg - 0.02) * 6))

      if (mouthMorphName) {
        const influences = (mesh as any).morphTargetInfluences as number[] | undefined
        const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined
        const idx = dict?.[mouthMorphName]
        if (influences && typeof idx === "number") {
          influences[idx] = amp
        }
      }

      if (jawBone) {
        jawBone.rotation.x = jawBaseRotX.current - amp * 0.35
      }

      if (!audio.paused && !audio.ended) {
        rafIdRef.current = requestAnimationFrame(tick)
      } else {
        stop()
      }
    }

    audio.onended = () => stop()
    audio.onpause = () => setSpeaking(false)
    audio.onplay = () => setSpeaking(true)
    try {
      await audio.play()
    } catch (e: any) {
      if (e?.name !== "AbortError") throw e
      return
    }
    rafIdRef.current = requestAnimationFrame(tick)
  }, [audioUrl, jawBone, mouthMorphName, stop, target])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return { speaking, speak, stop }
}
