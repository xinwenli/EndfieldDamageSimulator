import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { HomePage } from "./pages/HomePage";
import { SimulatorPage } from "./pages/SimulatorPage";

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="flex flex-col min-h-svh">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
