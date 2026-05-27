import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./AppShell";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));

describe("AppShell", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ email: null, signOut: async () => undefined } as ReturnType<typeof useAuth>);
  });

  it("renders the rail brand and the routed outlet child", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>CHILD</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("BetterYourAds")).toBeInTheDocument();
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });
});
