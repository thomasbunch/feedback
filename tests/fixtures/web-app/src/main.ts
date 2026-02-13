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

// Select handler -- exercises select_option tool
document.getElementById("color-select")!.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  output.textContent = `Selected: ${select.value}`;
});

// Hover handler -- exercises hover_element tool
document.getElementById("hover-target")!.addEventListener("mouseenter", () => {
  document.getElementById("tooltip")!.style.display = "block";
});
document.getElementById("hover-target")!.addEventListener("mouseleave", () => {
  document.getElementById("tooltip")!.style.display = "none";
});

// File input handler -- exercises file_upload tool
document.getElementById("file-input")!.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const names = Array.from(input.files || []).map(f => f.name).join(", ");
  document.getElementById("file-status")!.textContent = `Files: ${names}`;
});
document.getElementById("multi-file-input")!.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const names = Array.from(input.files || []).map(f => f.name).join(", ");
  document.getElementById("file-status")!.textContent = `Multi: ${names}`;
});

// Phase 16: Dialog triggers -- exercises handle_dialog tool
document.getElementById("trigger-alert")!.addEventListener("click", () => {
  alert("Test alert message");
});
document.getElementById("trigger-confirm")!.addEventListener("click", () => {
  const result = confirm("Test confirm message");
  output.textContent = `Confirm: ${result}`;
});
document.getElementById("trigger-prompt")!.addEventListener("click", () => {
  const result = prompt("Test prompt message", "default value");
  output.textContent = `Prompt: ${result}`;
});

// Async loading simulation -- exercises wait_for_condition tool
document.getElementById("trigger-async")!.addEventListener("click", () => {
  setTimeout(() => {
    document.getElementById("async-result")!.style.display = "block";
    document.getElementById("async-result")!.textContent = "Async loaded";
  }, 500);
});

// Responsive info display -- exercises resize_viewport tool
const responsiveInfoEl = document.getElementById("responsive-info")!;
const updateResponsiveInfo = () => {
  responsiveInfoEl.textContent = `${window.innerWidth}x${window.innerHeight}`;
};
updateResponsiveInfo();
window.addEventListener("resize", updateResponsiveInfo);
