import defaultConfig from '@/app/presets/Default_config.json';
import localforage from 'localforage';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import useConfigStore from './useConfigStore';
import useGlobalStore from './useGlobalStore';
import { PersistStorage, StorageValue, persist } from '../middleware/persist';
import _ from 'lodash';
import emptyConfig from '@/app/presets/empty_config.json';

export type PresetState = typeof defaultConfig & {
    // https://github.com/microsoft/TypeScript/issues/32063
    [key: `${string}.color`]: string,
    [key: `${string}.intensity`]: number,
    [key: `${string}.position`]: [number, number, number]
} & {
    Light: Record<string, any>,
    materials: Record<string, Record<string, any>>
} & {
    models: Record<string, {
        fileName: string,
        motionNames: string[],
        enableMorph: boolean,
        enablePhysics: boolean,
        enableMaterial: boolean
    }>,
}

let db = localforage.createInstance({ name: useConfigStore.getState().preset })

export const storage: PersistStorage<PresetState> = {
    getItem: async (name: string): Promise<StorageValue<PresetState>> => {
        const keys = await db.keys()
        const preset = Object.fromEntries(await Promise.all(
            keys.map(async (key) =>
                [key, await db.getItem(key)]
            )
        ))
        console.log(name, 'has been retrieved', preset)
        return {
            state: preset,
            version: preset.version ?? 0
        }
    },
    setItem: async (name: string, value: StorageValue<PresetState>): Promise<void> => {
        console.log(name, 'with value', value.state, 'has been saved')
        document.title = "臻灵数字人（保存中...）"
        for (const [key, val] of Object.entries(value.state)) {
            await db.setItem(key, val)
        }
        await db.setItem("version", value.version)
        document.title = "臻灵数字人"
    },
    removeItem: async (name: string): Promise<void> => {
        console.log(name, 'has been deleted')
        await db.clear()
    },
}

export const resetPreset = async ({ reactive } = { reactive: true }) => {
    const emptyPreset = emptyConfig as PresetState
    if (reactive) {
        usePresetStore.setState(emptyPreset)
    } else {
        await storage.setItem(useConfigStore.getState().preset, { state: emptyPreset })
    }
}

export const migratePreset = async (preset: any, version: number) => {
    usePresetStore.setState(states => {
        _.defaults(states, defaultConfig)
        return { ...states }
    })
    return preset
}

const usePresetStore = create(
    subscribeWithSelector(
        persist<PresetState>(
            () => {
                return {
                    ...defaultConfig
                } as PresetState
            },
            {
                name: useConfigStore.getState().preset,
                storage,
                version: 1,
                migrate: migratePreset
            })
    )
)

usePresetStore.persist.onFinishHydration(() => {
    usePresetStore.setState((state) => {
        const models = state.models ?? {}
        const character = models["character"]
        const fallback = "ぼんやり待ち合わせ_腕広いver(465f).vmd"
        const dance = "GimmeGimme_with_emotion.vmd"
        if (
            character?.fileName?.includes("芙宁娜")
            && (
                !character.motionNames
                || character.motionNames.length === 0
                || (character.motionNames.length === 1 && character.motionNames[0] === fallback)
            )
        ) {
            character.motionNames = [dance]
            return { models: { ...models } }
        }
        return {}
    })
    useGlobalStore.setState({ presetReady: true })
    if(useGlobalStore.getState().configReady) {
        useGlobalStore.setState({ storeReady: true })
    }
})

usePresetStore.persist.onHydrate(() => {
    useGlobalStore.setState({ presetReady: false, storeReady: false })
})

// move to here to avoid cycle imports
export const setPreset = async (newPresetName: string, rehydrate = false) => {
    useConfigStore.setState({ preset: newPresetName })
    usePresetStore.persist.setOptions({ name: newPresetName })
    db = localforage.createInstance({ name: newPresetName })
    if (rehydrate) {
        await usePresetStore.persist.rehydrate()
    }
}

export default usePresetStore;
