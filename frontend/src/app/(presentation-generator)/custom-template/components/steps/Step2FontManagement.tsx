/**
 * Step 2: Font Management
 * Handles font checking and uploading
 */

import React from "react";
import FontManager from "../FontManager";
import {
    FontData,
    FontItem,
    FontResolutionMap,
    UploadedFont,
} from "../../types";

interface Step2FontManagementProps {
    fontsData: FontData | null;
    fontResolutionsByKey: FontResolutionMap;
    uploadedFonts: UploadedFont[];
    uploadFont: (font: FontItem, file: File) => string | null;
    removeFont: (resolutionKey: string) => void;
    setFontReplacement: (font: FontItem, replacement: FontItem | null) => void;
    allFontsResolved: boolean;
    onContinue: () => Promise<void>;
    isUploading: boolean;
}

export const Step2FontManagement: React.FC<Step2FontManagementProps> = ({
    fontsData,
    fontResolutionsByKey,
    uploadedFonts,
    uploadFont,
    removeFont,
    setFontReplacement,
    allFontsResolved,
    onContinue,
    isUploading,
}) => {
    if (!fontsData) return null;

    return (
        <FontManager
            fontsData={fontsData}
            fontResolutionsByKey={fontResolutionsByKey}
            uploadedFonts={uploadedFonts}
            uploadFont={uploadFont}
            removeFont={removeFont}
            setFontReplacement={setFontReplacement}
            allFontsResolved={allFontsResolved}
            onContinue={onContinue}
            isUploading={isUploading}
        />
    );
};

