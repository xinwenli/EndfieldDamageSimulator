import { PartyPanel } from "../components/party/PartyPanel";
import { Timeline } from "../components/timeline/Timeline";
import { DPSResults } from "../components/dps/DPSResults";

export function SimulatorPage() {
  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <PartyPanel />
      <Timeline />
      <DPSResults />
    </div>
  );
}
