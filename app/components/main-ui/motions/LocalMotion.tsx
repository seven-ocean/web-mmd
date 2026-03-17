import { MouseEvent } from "react";
import usePresetStore from "@/app/stores/usePresetStore";
import { MenuItem } from "@mui/material";
import ResourceCard from "../resources/ResourceCard";
import onDelete from "./onDelete";
import { useT } from "@/app/i18n/useT";

function LocalMotion({ name }: { name: string }) {
    const t = useT()

    const onClick = (e: MouseEvent) => {
        
    }

    return (
        <ResourceCard
            name={name}
            onClick={onClick}
            selected={false}
        >
            <MenuItem sx={{ color: 'red' }} onClick={() => onDelete(name)}>
                {t("resource.deleteMotion")}
            </MenuItem>
        </ResourceCard>
    );
}

export default LocalMotion;
