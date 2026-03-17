"use client"

import PmxModel from "@/app/components/three-world/model/PMXModel"
import { useT } from "@/app/i18n/useT"
import { Html, OrbitControls } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimationAction, AnimationMixer, Box3, DirectionalLight, LoopRepeat, Object3D, Raycaster, SkinnedMesh, Vector3 } from "three"
import useGlobalStore from "@/app/stores/useGlobalStore"
import useConfigStore from "@/app/stores/useConfigStore"
import buildUpdatePMX from "@/app/components/three-world/model/helper/buildUpdatePMX"
import makeClipLoopable from "@/app/components/three-world/animation/makeClipLoopable"
import useLipSync from "./useLipSync"
import useAihumanControlStore from "./useAihumanControlStore"

function placeOnGround(mesh: SkinnedMesh) {
  const box = new Box3().setFromObject(mesh)
  const minY = box.min.y
  if (!Number.isFinite(minY)) return
  mesh.position.y -= minY
}

function getFeetY(mesh: SkinnedMesh) {
  const box = new Box3().setFromObject(mesh)
  return box.min.y
}

function pickStageFloorY(stage: SkinnedMesh, x = 0, z = 0) {
  const raycaster = new Raycaster(new Vector3(x, 500, z), new Vector3(0, -1, 0), 0, 1500)
  const hits = raycaster.intersectObject(stage, true)
  if (!hits.length) return null

  let bestY: number | null = null
  for (const hit of hits) {
    if (!hit.face) continue
    const n = hit.face.normal.clone()
    n.transformDirection((hit.object as any).matrixWorld)
    if (n.y > 0.35) {
      if (bestY == null || hit.point.y > bestY) bestY = hit.point.y
    }
  }

  return bestY
}

export default function AihumanScene() {
  const t = useT()
  const pmxFiles = useConfigStore((s) => s.pmxFiles)
  const motionFiles = useConfigStore((s) => s.motionFiles)
  const motionFilesSafe = useMemo(() => motionFiles ?? {}, [motionFiles])
  const emptyTextures = useMemo(() => ({} as Record<string, string>), [])
  const [character, setCharacter] = useState<SkinnedMesh | null>(null)
  const [stage, setStage] = useState<SkinnedMesh | null>(null)
  const configReady = useGlobalStore((s) => s.configReady)
  const loader = useGlobalStore((s) => s.loader)
  const orbitTargetRef = useRef<[number, number, number]>([0, 12, 0])
  const controlsRef = useRef<any>(null)
  const camera = useThree((s) => s.camera)

  const stageUrl = useMemo(() => pmxFiles?.models?.["RedialC_EpRoomDS/EPDS.pmx"], [pmxFiles])
  const stageTextures = useMemo(() => pmxFiles?.modelTextures?.["RedialC_EpRoomDS"] ?? {}, [pmxFiles])
  const characterUrl = useMemo(() => pmxFiles?.models?.["芙宁娜/芙宁娜.pmx"] ?? "/MMD/芙宁娜/芙宁娜.pmx", [pmxFiles])

  const lightRef = useRef<DirectionalLight>(null)
  const fillLightRef = useRef<DirectionalLight>(null)
  const idleActionRef = useRef<AnimationAction | null>(null)
  const idleReadyRef = useRef(false)
  const idleBaseRotRef = useRef<{ boneX: number; rootY: number }>({ boneX: 0, rootY: 0 })
  const mixer = useMemo(() => (character ? new AnimationMixer(character) : null), [character])
  const updatePMX = useMemo(() => (character ? buildUpdatePMX(character) : null), [character])
  const onLoop = useMemo(() => {
    if (!character || !mixer || !updatePMX) return null

    let backupBones = new Float32Array(character.skeleton.bones.length * 7)
    let init = false

    const copyBones = (fromOrTo: "fromArray" | "toArray") => {
      if (!init) {
        init = true
        character.pose()
        return
      }
      const bones = character.skeleton.bones
      for (let i = 0, il = bones.length; i < il; i++) {
        const bone = bones[i]
        bone.position[fromOrTo](backupBones, i * 7)
        bone.quaternion[fromOrTo](backupBones, i * 7 + 3)
      }
    }

    const restoreBones = () => copyBones("fromArray")
    const saveBones = () => copyBones("toArray")

    return (delta: number) => {
      restoreBones()
      mixer.update(delta)
      saveBones()
      updatePMX()
    }
  }, [character, mixer, updatePMX])

  useEffect(() => {
    if (!character) return
    character.pose()
  }, [character])

  useEffect(() => {
    if (!stage) return
    placeOnGround(stage)
  }, [stage])

  useEffect(() => {
    if (!stage || !character) return
    const stageBox = new Box3().setFromObject(stage)
    const stageCenter = stageBox.getCenter(new Vector3())
    const floorY = pickStageFloorY(stage, stageCenter.x, stageCenter.z) ?? stageBox.min.y

    character.position.x = stageCenter.x
    character.position.z = stageCenter.z

    if (floorY == null) {
      placeOnGround(character)
      return
    }
    const feetY = getFeetY(character)
    if (!Number.isFinite(feetY)) return
    character.position.y += floorY - feetY + 0.02

    const targetY = floorY + 12
    orbitTargetRef.current = [stageCenter.x, targetY, stageCenter.z]

    if (controlsRef.current) {
      controlsRef.current.target.set(stageCenter.x, targetY, stageCenter.z)
      controlsRef.current.update()
    }

    camera.position.set(stageCenter.x, targetY + 6, stageCenter.z + 55)
    camera.lookAt(stageCenter.x, targetY, stageCenter.z)
    camera.updateMatrixWorld()

    if (lightRef.current) {
      lightRef.current.position.set(stageCenter.x + 0, targetY + 19.634, stageCenter.z - 12.963)
      lightRef.current.target.position.set(stageCenter.x, targetY, stageCenter.z)
      lightRef.current.target.updateMatrixWorld()
    }
    if (fillLightRef.current) {
      fillLightRef.current.position.set(stageCenter.x - 0.103, targetY + 3.045, stageCenter.z + 15.362)
      fillLightRef.current.target.position.set(stageCenter.x, targetY, stageCenter.z)
      fillLightRef.current.target.updateMatrixWorld()
    }
  }, [camera, character, stage])

  useEffect(() => {
    if (!character || !mixer || idleReadyRef.current) return
    const idleVmd = motionFilesSafe["ぼんやり待ち合わせ_腕広いver(465f).vmd"]
    if (!idleVmd) return

    idleReadyRef.current = true

    const init = async () => {
      const clip = await loader.loadAnimation(idleVmd, character, () => {})
      if (clip.tracks.length === 0) return
      const action = mixer.clipAction(clip)
      makeClipLoopable(clip)
      action.setLoop(LoopRepeat, Infinity)
      action.play()
      idleActionRef.current = action
    }

    init()
    return () => {
      idleActionRef.current?.stop()
      idleActionRef.current = null
      mixer.stopAllAction()
      mixer.uncacheRoot(character)
      idleReadyRef.current = false
    }
  }, [character, loader, mixer, motionFilesSafe])

  const { speaking, speak, stop } = useLipSync(character, "/audio/zhenling.wav")
  const setActions = useAihumanControlStore((s) => s.setActions)
  const clearActions = useAihumanControlStore((s) => s.clearActions)
  const setSpeaking = useAihumanControlStore((s) => s.setSpeaking)

  useEffect(() => {
    setActions({ speak, stop })
    return () => {
      clearActions()
    }
  }, [clearActions, setActions, speak, stop])

  useEffect(() => {
    setSpeaking(speaking)
  }, [setSpeaking, speaking])

  const onCreateStage = useCallback((mesh: SkinnedMesh) => {
    setStage((prev) => prev ?? mesh)
  }, [])

  const onCreateCharacter = useCallback((mesh: SkinnedMesh) => {
    if (!mesh.getObjectByName("smoothCenter")) {
      const smoothCenter = new Object3D()
      smoothCenter.name = "smoothCenter"
      mesh.add(smoothCenter)
    }
    setCharacter((prev) => prev ?? mesh)
  }, [])

  useFrame(({ camera }, delta) => {
    if (!character) return

    if (idleActionRef.current && onLoop) {
      onLoop(delta)
    } else {
      const bone = character.skeleton?.getBoneByName("上半身")
      const root = character.skeleton?.getBoneByName("センター") ?? character.skeleton?.bones?.[0]
      const t = performance.now() * 0.001
      if (!speaking && bone && root) {
        if (idleBaseRotRef.current.boneX === 0 && idleBaseRotRef.current.rootY === 0) {
          idleBaseRotRef.current = { boneX: bone.rotation.x, rootY: root.position.y }
        }
        bone.rotation.x = idleBaseRotRef.current.boneX + Math.sin(t * 1.2) * 0.03
        root.position.y = idleBaseRotRef.current.rootY + Math.sin(t * 1.2) * 0.15
      }
      updatePMX?.()
    }
  })

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight ref={lightRef} intensity={3.7} position={[0, 19.634, -12.963]} castShadow />
      <directionalLight ref={fillLightRef} intensity={2.0} position={[-0.103, 3.045, 15.362]} castShadow={false} />
      {!configReady && (
        <Html fullscreen style={{ pointerEvents: "none" }}>
          <div style={{ position: "fixed", top: 20, left: 20, color: "white" }}>Loading...</div>
        </Html>
      )}
      {stageUrl && (
        <PmxModel
          name="stage"
          url={stageUrl}
          modelTextures={stageTextures}
          castShadow={false}
          receiveShadow={true}
          onCreate={onCreateStage}
        />
      )}
      <PmxModel
        name="character"
        url={characterUrl}
        modelTextures={emptyTextures}
        castShadow={true}
        receiveShadow={true}
        onCreate={onCreateCharacter}
      />
      <OrbitControls ref={controlsRef} target={orbitTargetRef.current} enableDamping dampingFactor={0.08} />
      <Html fullscreen style={{ pointerEvents: "none" }} />
    </>
  )
}
