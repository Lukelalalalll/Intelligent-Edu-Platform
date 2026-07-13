import DashboardPage from "@/app/(presentation-generator)/(workspace)/dashboard/components/DashboardPage";
import { PptGeneratorScreen } from "@/ppt_generator/PptGeneratorScreen";

export default function PptGeneratorDashboardRoute() {
  return (
    <PptGeneratorScreen
      bleed="full"
      contentClassName="!bg-transparent !pb-6 !pt-4 sm:!pt-5 lg:!pt-6"
      bootstrapBlocking={false}
    >
      <DashboardPage />
    </PptGeneratorScreen>
  );
}

