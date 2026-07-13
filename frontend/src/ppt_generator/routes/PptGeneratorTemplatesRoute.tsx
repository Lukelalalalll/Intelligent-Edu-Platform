import TemplatePanel from "@/app/(presentation-generator)/(workspace)/templates/components/TemplatePanel";
import { PptGeneratorScreen } from "@/ppt_generator/PptGeneratorScreen";

export default function PptGeneratorTemplatesRoute() {
  return (
    <PptGeneratorScreen bootstrapBlocking={false}>
      <TemplatePanel />
    </PptGeneratorScreen>
  );
}

