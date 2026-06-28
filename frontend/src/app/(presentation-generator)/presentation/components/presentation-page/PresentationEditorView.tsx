import Chat from "../Chat";
import PresentationHeader from "../PresentationHeader";
import SidePanel from "../SidePanel";
import type { ChatProps } from "../chat/Chat.types";
import PresentationSlidesViewport from "./PresentationSlidesViewport";
import type { PresentationSlidesViewportProps } from "./PresentationSlidesViewport";
import type { SlideScrollBehavior } from "../../hooks/usePresentationSlidesViewport";

type PresentationEditorHeaderProps = {
  presentationId: string;
  isSaving: boolean;
  selectedSlide: number;
};

type PresentationEditorSidePanelProps = {
  presentationId: string;
  loading: boolean;
  selectedSlide: number;
  onSlideSelect: (index: number, behavior?: SlideScrollBehavior) => void;
};

export type PresentationEditorViewProps = {
  header: PresentationEditorHeaderProps;
  sidePanel: PresentationEditorSidePanelProps;
  slidesViewport: PresentationSlidesViewportProps;
  chat: ChatProps;
};

const PresentationEditorView = ({
  header,
  sidePanel,
  slidesViewport,
  chat,
}: PresentationEditorViewProps) => {
  return (
    <div className="h-[calc(100dvh-var(--nav-height,60px))] min-h-[720px] overflow-hidden font-syne">
      <div
        id="presentation-slides-wrapper"
        style={{ background: "#EDEEEF" }}
        className="relative flex h-full flex-col overflow-hidden"
      >
        <PresentationHeader
          presentation_id={header.presentationId}
          isPresentationSaving={header.isSaving}
          currentSlide={header.selectedSlide}
        />
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden xl:gap-5">
          <div className="sticky top-0 h-full w-[200px] shrink-0 self-start pt-4 xl:w-[224px] 2xl:w-[236px]">
            <SidePanel
              selectedSlide={sidePanel.selectedSlide}
              onSlideClick={sidePanel.onSlideSelect}
              presentationId={sidePanel.presentationId}
              loading={sidePanel.loading}
            />
          </div>
          <div className="relative flex h-full min-w-0 flex-1 gap-4 xl:gap-5">
            <PresentationSlidesViewport {...slidesViewport} />
            <div className="sticky top-0 h-full w-full max-w-[370px] shrink-0 self-start">
              <Chat {...chat} />
            </div>
            <div
              id="presentation-editor-overlay-root"
              className="pointer-events-none absolute inset-0 z-[90]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationEditorView;

