import { useState } from "react";
import { Header } from "./components/layout/Header";
import { OperatorSetupPage } from "./pages/OperatorSetupPage";
import { SimulatorPage } from "./pages/SimulatorPage";

type Tab = "setup" | "simulator";

function App() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <div className="flex flex-col min-h-svh">
      <Header activeTab={tab} onTabChange={setTab} />
      {tab === "setup" ? <OperatorSetupPage /> : <SimulatorPage />}
    </div>
  );
}

export default App;
