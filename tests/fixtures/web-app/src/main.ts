// Web fixture interactive behavior for testing

const output = document.getElementById("output")!;

// Click handler -- exercises click_element and get_element_state tools
document.getElementById("click-me")!.addEventListener("click", () => {
  output.textContent = "Button was clicked!";
});

// Input handler -- exercises type_text tool
document.getElementById("text-input")!.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  output.textContent = `Typed: ${input.value}`;
});

// Show hidden element -- exercises wait_for_element tool
document.getElementById("show-hidden")!.addEventListener("click", () => {
  document.getElementById("hidden-element")!.style.display = "block";
});

// Throw error -- exercises get_errors tool
document.getElementById("throw-error")!.addEventListener("click", () => {
  throw new Error("Deliberate test error");
});

// Fetch data -- exercises get_network_logs tool (will 404)
document.getElementById("fetch-data")!.addEventListener("click", () => {
  fetch("/api/data").catch(() => {
    // Expected to fail -- tests network log capture
  });
});

// Console output for get_console_logs tests
console.log("Fixture app loaded");
console.warn("Fixture warning");
console.error("Fixture error");
