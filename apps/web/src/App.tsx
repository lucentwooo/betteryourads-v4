import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./shell/AuthGate";
import { AppShell } from "./shell/AppShell";
import Home from "./home/Home";
import Library from "./library/Library";
import Workbench from "./workbench/Workbench";
import AdminDashboard from "./admin/AdminDashboard";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<Workbench />} />
              <Route path="/library" element={<Library />} />
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
