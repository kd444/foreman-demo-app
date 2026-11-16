const form = document.getElementById("reset-form");
const emailInput = document.getElementById("email");
const button = document.getElementById("send-reset");
const errorEl = document.getElementById("error");
const confirmation = document.getElementById("confirmation");
const sentTo = document.getElementById("sent-to");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  button.disabled = true;
  button.textContent = "Sending...";
  try {
    const res = await fetch("/api/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailInput.value.trim() }),
    });
    const body = await res.json();
    if (res.status === 201 && body.ok) {
      sentTo.textContent = emailInput.value.trim();
      form.hidden = true;
      confirmation.hidden = false;
    } else {
      errorEl.textContent = body.error || "Something went wrong.";
      errorEl.hidden = false;
    }
  } catch {
    errorEl.textContent = "Network error. Try again.";
    errorEl.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Send reset link";
  }
});
