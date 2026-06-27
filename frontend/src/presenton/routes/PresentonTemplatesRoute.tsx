import TemplatePanel from "@/app/(presentation-generator)/(workspace)/templates/components/TemplatePanel";
import { PresentonScreen } from "@/presenton/PresentonScreen";

export default function PresentonTemplatesRoute() {
  return (
    <PresentonScreen bootstrapBlocking={false}>
      <TemplatePanel />
    </PresentonScreen>
  );
}
