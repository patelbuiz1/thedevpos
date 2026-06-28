const form = document.querySelector("#quoteForm");
const statusEl = document.querySelector("#formStatus");

form.addEventListener("submit", async event => {
  event.preventDefault();
  statusEl.classList.remove("error");
  statusEl.textContent = "Sending your quote request...";

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Something went wrong.");

    statusEl.textContent = `Sent. Your enquiry ID is ${result.enquiryId}.`;
    form.reset();
  } catch (error) {
    statusEl.classList.add("error");
    statusEl.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
