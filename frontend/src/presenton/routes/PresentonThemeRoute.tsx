import ThemePanel from "@/app/(presentation-generator)/(workspace)/theme/components/ThemePanel";
import { PresentonScreen } from "@/presenton/PresentonScreen";

export default function PresentonThemeRoute() {
  return (
    <PresentonScreen bootstrapBlocking={false}>
      <ThemePanel />
    </PresentonScreen>
  );
}
