import { useState } from "react";
import { Header } from "./components/layout/Header";
import { OperatorSetupPage } from "./pages/OperatorSetupPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";

type Tab = "setup" | "simulator";

function App() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <div className="flex flex-col min-h-svh">
      <Header activeTab={tab} onTabChange={setTab} />
      <ErrorBoundary key={tab}>
        {tab === "setup" ? <OperatorSetupPage /> : <SimulatorPage />}
      </ErrorBoundary>
    </div>
  );
}

export default App;
