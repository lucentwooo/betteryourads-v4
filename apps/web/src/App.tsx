import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./shell/AuthGate";
import { AppShell } from "./shell/AppShell";

function HomePlaceholder() {
  return <h1>Home — built in the Workbench/Home slices.</h1>;
}
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
              <Route path="/" element={<HomePlaceholder />} />
              <Route path="/library" element={<LibraryPlaceholder />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
