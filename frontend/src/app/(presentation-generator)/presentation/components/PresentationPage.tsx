"use client";

import "../../utils/prism-languages";
import PresentationMode from "./PresentationMode";
import { PresentationPageProps } from "../types";
import PresentationEditorView from "./presentation-page/PresentationEditorView";
import PresentationErrorState from "./presentation-page/PresentationErrorState";
import { usePresentationPageController } from "../hooks/usePresentationPageController";

const PresentationPage = ({
  presentation_id,
}: PresentationPageProps) => {
  const page = usePresentationPageController(presentation_id);

  if (page.mode === "present") {
    return <PresentationMode {...page.presentModeProps} />;
  }

  if (page.mode === "error") {
    return <PresentationErrorState {...page.errorStateProps} />;
  }

  return <PresentationEditorView {...page.editorViewProps} />;
};

export default PresentationPage;

