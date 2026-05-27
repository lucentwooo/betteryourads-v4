import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./shell/AuthGate";
import { AppShell } from "./shell/AppShell";
import Workbench from "./workbench/Workbench";

function LibraryPlaceholder() {
  return <h1>Library — built in the Library slice.</h1>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Workbench />} />
              <Route path="/library" element={<LibraryPlaceholder />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
