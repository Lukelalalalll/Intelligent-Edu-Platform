import ThemePanel from "@/app/(presentation-generator)/(workspace)/theme/components/ThemePanel";
import { PptGeneratorScreen } from "@/ppt_generator/PptGeneratorScreen";

export default function PptGeneratorThemeRoute() {
  return (
    <PptGeneratorScreen bootstrapBlocking={false}>
      <ThemePanel />
    </PptGeneratorScreen>
  );
}

