import DashboardPage from "@/app/(presentation-generator)/(workspace)/dashboard/components/DashboardPage";
import { PresentonScreen } from "@/presenton/PresentonScreen";

export default function PresentonDashboardRoute() {
  return (
    <PresentonScreen bleed="full" bootstrapBlocking={false}>
      <DashboardPage />
    </PresentonScreen>
  );
}
