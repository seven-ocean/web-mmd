import { MouseEvent } from "react";
import useConfigStore from "@/app/stores/useConfigStore";
import { setPreset } from "@/app/stores/usePresetStore";
import { MenuItem } from "@mui/material";
import { copyPreset, savePreset, saveConfigOnly } from "@/app/components/panel/presetFn";
import ResourceCard from "../resources/ResourceCard";
import useGlobalStore from "@/app/stores/useGlobalStore";
import useDelete from "./useDelete";
import { useT } from "@/app/i18n/useT";

function LocalPreset({ name }: { name: string }) {
    const t = useT()
    const presetsInfo = useConfigStore(state => state.presetsInfo)
    const screenShot = presetsInfo[name]?.screenShot
    const onDelete = useDelete()

    const preset = useConfigStore(state => state.preset)
    const isCurrentPreset = preset === name

    const onClick = (e: MouseEvent) => {
        setPreset(name, true)
        useGlobalStore.setState({ openMainUI: false })
    }

    return (
        <ResourceCard
            name={name}
            previewImgSrc={screenShot}
            onClick={isCurrentPreset ? undefined : onClick}
            selected={isCurrentPreset}
        >
            <MenuItem onClick={() => copyPreset(name)}>
                {t("resource.copyPreset")}
            </MenuItem>
            <MenuItem onClick={() => savePreset(name)}>
                {t("resource.savePreset")}
            </MenuItem>
            <MenuItem onClick={() => saveConfigOnly(name)}>
                {t("resource.saveConfigOnly")}
            </MenuItem>
            <MenuItem sx={{ color: 'red' }} onClick={() => onDelete(name)}>
                {t("resource.deletePreset")}
            </MenuItem>
        </ResourceCard>
    );
}

export default LocalPreset;
