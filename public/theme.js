// Runs before paint so the saved theme does not flash.
try {
  var t = localStorage.getItem("autodm-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
