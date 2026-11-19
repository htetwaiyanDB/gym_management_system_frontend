import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axiosClient from "../../api/axiosClient";
import Login from "./Login";

vi.mock("../../api/axiosClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const challenge = (key, image = `data:image/svg+xml,${key}`) => ({
  data: { key, img: image, sensitive: false, captcha: "<img>" },
});

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>);
}

async function fillAndSubmit(captcha = "1234") {
  fireEvent.change(screen.getByLabelText("Email or Phone"), {
    target: { value: "member@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
  fireEvent.change(screen.getByLabelText("Captcha"), { target: { value: captcha } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("Login CAPTCHA flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the CAPTCHA image and enables login only after receiving its key", async () => {
    axiosClient.get.mockResolvedValueOnce(challenge("key-1", "data:image/png;base64,first"));
    renderLogin();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(await screen.findByAltText("CAPTCHA challenge")).toHaveAttribute(
      "src", "data:image/png;base64,first",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(axiosClient.get).toHaveBeenCalledWith("/captcha");
  });

  it("submits the stateless CAPTCHA key with the login payload", async () => {
    axiosClient.get.mockResolvedValueOnce(challenge("key-1"));
    axiosClient.post.mockResolvedValueOnce({
      data: { token: "token-1", user: { role: "member" } },
    });
    renderLogin();
    await screen.findByAltText("CAPTCHA challenge");
    await fillAndSubmit(" 1234 ");

    await waitFor(() => expect(axiosClient.post).toHaveBeenCalledWith("/login", {
      identifier: "member@example.com",
      password: "secret",
      captcha: "1234",
      captcha_key: "key-1",
    }));
  });

  it("clears the answer and replaces the image/key together on refresh", async () => {
    axiosClient.get
      .mockResolvedValueOnce(challenge("key-1", "data:image/png;base64,first"))
      .mockResolvedValueOnce(challenge("key-2", "data:image/png;base64,second"));
    axiosClient.post.mockResolvedValueOnce({
      data: { token: "token-2", user: { role: "member" } },
    });
    renderLogin();
    await screen.findByAltText("CAPTCHA challenge");
    fireEvent.change(screen.getByLabelText("Captcha"), { target: { value: "old answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh CAPTCHA" }));

    await waitFor(() => expect(screen.getByAltText("CAPTCHA challenge")).toHaveAttribute(
      "src", "data:image/png;base64,second",
    ));
    expect(screen.getByLabelText("Captcha")).toHaveValue("");

    await fillAndSubmit("5678");
    await waitFor(() => expect(axiosClient.post).toHaveBeenCalledWith(
      "/login", expect.objectContaining({ captcha_key: "key-2" }),
    ));
  });

  it("keeps validation messages visible and fetches a new CAPTCHA after failed login", async () => {
    axiosClient.get
      .mockResolvedValueOnce(challenge("consumed-key", "data:image/png;base64,first"))
      .mockResolvedValueOnce(challenge("fresh-key", "data:image/png;base64,second"));
    axiosClient.post.mockRejectedValueOnce({
      response: { data: { errors: {
        captcha_key: ["Captcha has expired. Please refresh and try again."],
        captcha: ["Invalid or expired captcha. Please try again."],
      } } },
    });
    renderLogin();
    await screen.findByAltText("CAPTCHA challenge");
    await fillAndSubmit();

    expect(await screen.findByText(/Captcha has expired/)).toBeVisible();
    expect(screen.getByText(/Invalid or expired captcha/)).toBeVisible();
    await waitFor(() => expect(axiosClient.get).toHaveBeenCalledTimes(2));
    expect(screen.getByAltText("CAPTCHA challenge")).toHaveAttribute(
      "src", "data:image/png;base64,second",
    );
    expect(screen.getByLabelText("Captcha")).toHaveValue("");
  });

  it("prevents submission when no CAPTCHA key is available", async () => {
    axiosClient.get.mockRejectedValueOnce(new Error("network error"));
    renderLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load CAPTCHA");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(axiosClient.post).not.toHaveBeenCalled();
  });
});
