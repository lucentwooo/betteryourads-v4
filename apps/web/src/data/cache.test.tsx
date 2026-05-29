import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CacheProvider, useResource } from "./cache";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getBrands: vi.fn(), getAds: vi.fn(), getUsage: vi.fn() } };
});
import { api } from "../api/client";

beforeEach(() => vi.clearAllMocks());

function AdsProbe() {
  const { data, status } = useResource<{ id: string }[]>("ads");
  return <div data-testid="probe">{`${status}:${(data ?? []).length}`}</div>;
}

describe("client data cache", () => {
  it("transitions idle→loading→ready and exposes fetched data", async () => {
    vi.mocked(api.getAds).mockResolvedValue([{ id: "a1" }] as never);
    render(
      <CacheProvider>
        <AdsProbe />
      </CacheProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ready:1"));
    expect(api.getAds).toHaveBeenCalledTimes(1);
  });

  it("serves cached data on remount and revalidates in the background (stale-while-revalidate)", async () => {
    vi.mocked(api.getAds).mockResolvedValue([{ id: "a1" }] as never);

    function Harness() {
      const [show, setShow] = useState(true);
      return (
        <CacheProvider>
          <button onClick={() => setShow((v) => !v)}>toggle</button>
          {show ? <AdsProbe /> : null}
        </CacheProvider>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ready:1"));

    // unmount the consumer, then remount it — the provider (and its store) stays alive
    act(() => void screen.getByText("toggle").click()); // hide
    act(() => void screen.getByText("toggle").click()); // show again

    // cached data is present immediately (length never returns to 0)...
    expect(screen.getByTestId("probe").textContent).not.toBe("ready:0");
    expect(screen.getByTestId("probe").textContent?.endsWith(":1")).toBe(true);
    // ...and a background refresh fires
    await waitFor(() => expect(api.getAds).toHaveBeenCalledTimes(2));
  });

  it("captures the error message when the fetch rejects", async () => {
    vi.mocked(api.getAds).mockRejectedValue(new Error("boom"));
    function ErrProbe() {
      const { status, error } = useResource("ads");
      return <div data-testid="err">{`${status}:${error ?? ""}`}</div>;
    }
    render(
      <CacheProvider>
        <ErrProbe />
      </CacheProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("err").textContent).toBe("error:boom"));
  });
});
